const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SEED_TAG = "[Billing recovery seed]";

function readEnvFile(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const separator = line.indexOf("=");
      if (separator > 0) {
        acc[line.slice(0, separator)] = line.slice(separator + 1);
      }
      return acc;
    }, {});
}

function makeSupabaseClient() {
  const env = readEnvFile(path.join(process.cwd(), ".env.local"));
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function getTargetGym(supabase) {
  const requestedSlug = process.argv[2] ?? process.env.BILLING_RECOVERY_SEED_GYM_SLUG;

  if (requestedSlug) {
    const { data, error } = await supabase
      .from("gyms")
      .select("id, name, slug")
      .eq("slug", requestedSlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("gyms")
    .select("id, name, slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No gym found.");
  return data;
}

async function clearPreviousSeed(supabase, gymId) {
  const { data: seedPayments, error } = await supabase
    .from("payments")
    .select("id")
    .eq("gym_id", gymId)
    .ilike("description", `%${SEED_TAG}%`);

  if (error) throw error;

  const paymentIds = (seedPayments ?? []).map((payment) => payment.id);

  if (paymentIds.length === 0) {
    return;
  }

  const { data: cases, error: caseQueryError } = await supabase
    .from("billing_recovery_cases")
    .select("id")
    .in("payment_id", paymentIds);

  if (caseQueryError) throw caseQueryError;

  const caseIds = (cases ?? []).map((recoveryCase) => recoveryCase.id);

  if (caseIds.length > 0) {
    const { error: attemptsError } = await supabase
      .from("billing_recovery_attempts")
      .delete()
      .in("case_id", caseIds);

    if (attemptsError) throw attemptsError;

    const { error: casesError } = await supabase
      .from("billing_recovery_cases")
      .delete()
      .in("id", caseIds);

    if (casesError) throw casesError;
  }

  const { error: paymentDeleteError } = await supabase
    .from("payments")
    .delete()
    .in("id", paymentIds);

  if (paymentDeleteError) throw paymentDeleteError;
}

async function ensurePolicy(supabase, gymId) {
  const { data, error } = await supabase
    .from("billing_retry_policies")
    .upsert(
      {
        gym_id: gymId,
        retry_offsets_days: [2, 4, 7],
        reminder_offsets_days: [0, 2, 4, 7],
        max_attempts: 3,
        final_notice_after_days: 10,
        auto_retry_enabled: true,
        member_notifications_enabled: true,
        daily_report_enabled: true
      },
      {
        onConflict: "gym_id"
      }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function getSubscriptions(supabase, gymId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, gym_id, member_id, membership_plan_id, status, membership_plans ( price_cents )")
    .eq("gym_id", gymId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(90);

  if (error) throw error;
  if (!data || data.length < 10) {
    throw new Error("Need at least 10 subscriptions to seed recovery data.");
  }

  return data;
}

function getPlanAmount(subscription, fallback) {
  const plan = Array.isArray(subscription.membership_plans)
    ? subscription.membership_plans[0]
    : subscription.membership_plans;

  return plan?.price_cents ?? fallback;
}

async function insertPayments(supabase, gymId, subscriptions) {
  const now = new Date();
  const payments = [];

  subscriptions.slice(0, 28).forEach((subscription, index) => {
    const failedAt = addDays(now, -(index % 9));
    const amount = getPlanAmount(subscription, 14900);

    payments.push({
      gym_id: gymId,
      member_id: subscription.member_id,
      subscription_id: subscription.id,
      amount_cents: amount,
      status: "failed",
      paid_at: null,
      due_at: failedAt.toISOString(),
      invoice_number: `REC-FAIL-${String(index + 1).padStart(3, "0")}`,
      description: `${SEED_TAG} Failed membership invoice`,
      payment_type: "membership",
      accounting_category: "membership",
      late_fee_cents: index % 3 === 0 ? 1500 : 0,
      tax_cents: 0,
      discount_cents: 0,
      manual_payment_note: "Seeded failed payment for billing recovery load testing",
      payment_method_label: "Card on file",
      stripe_invoice_id: null,
      stripe_payment_intent_id: null
    });
  });

  subscriptions.slice(28, 40).forEach((subscription, index) => {
    const dueAt = addDays(now, -(3 + index));
    const amount = getPlanAmount(subscription, 9900);

    payments.push({
      gym_id: gymId,
      member_id: subscription.member_id,
      subscription_id: subscription.id,
      amount_cents: amount,
      status: "overdue",
      paid_at: null,
      due_at: dueAt.toISOString(),
      invoice_number: `REC-OVER-${String(index + 1).padStart(3, "0")}`,
      description: `${SEED_TAG} Overdue membership invoice`,
      payment_type: "membership",
      accounting_category: "membership",
      late_fee_cents: 1000,
      tax_cents: 0,
      discount_cents: 0,
      manual_payment_note: "Seeded overdue payment for billing recovery load testing",
      payment_method_label: "Manual invoice",
      stripe_invoice_id: null,
      stripe_payment_intent_id: null
    });
  });

  subscriptions.slice(40, 50).forEach((subscription, index) => {
    const paidAt = addDays(now, -(index % 5));
    const amount = getPlanAmount(subscription, 19900);

    payments.push({
      gym_id: gymId,
      member_id: subscription.member_id,
      subscription_id: subscription.id,
      amount_cents: amount,
      status: "succeeded",
      paid_at: paidAt.toISOString(),
      due_at: paidAt.toISOString(),
      invoice_number: `REC-PAID-${String(index + 1).padStart(3, "0")}`,
      description: `${SEED_TAG} Refundable paid membership invoice`,
      payment_type: "membership",
      accounting_category: "membership",
      late_fee_cents: 0,
      tax_cents: 0,
      discount_cents: 0,
      manual_payment_note: "Seeded paid payment for refund testing",
      payment_method_label: "Card on file",
      stripe_invoice_id: null,
      stripe_payment_intent_id: null
    });
  });

  const { data, error } = await supabase.from("payments").insert(payments).select("*");
  if (error) throw error;
  return data ?? [];
}

async function insertCasesAndAttempts(supabase, policy, payments) {
  const failedOrOverdue = payments.filter((payment) =>
    ["failed", "overdue"].includes(payment.status)
  );
  const cases = failedOrOverdue.map((payment) => {
    const firstFailedAt = payment.due_at ?? payment.created_at;
    return {
      gym_id: payment.gym_id,
      member_id: payment.member_id,
      subscription_id: payment.subscription_id,
      payment_id: payment.id,
      reason: payment.status === "overdue" ? "overdue_payment" : "failed_payment",
      status: "open",
      priority: payment.amount_cents >= 15000 ? "critical" : "high",
      amount_cents: payment.amount_cents,
      retry_count: 0,
      max_retries: policy.max_attempts,
      first_failed_at: firstFailedAt,
      next_retry_at: addDays(new Date(firstFailedAt), policy.retry_offsets_days[0]).toISOString(),
      stripe_invoice_id: payment.stripe_invoice_id,
      stripe_payment_intent_id: payment.stripe_payment_intent_id
    };
  });

  const { data: insertedCases, error: caseError } = await supabase
    .from("billing_recovery_cases")
    .insert(cases)
    .select("*");

  if (caseError) throw caseError;

  const attempts = [];

  for (const recoveryCase of insertedCases ?? []) {
    policy.retry_offsets_days.slice(0, policy.max_attempts).forEach((offset, index) => {
      attempts.push({
        gym_id: recoveryCase.gym_id,
        case_id: recoveryCase.id,
        payment_id: recoveryCase.payment_id,
        member_id: recoveryCase.member_id,
        attempt_number: index + 1,
        action: "retry_charge",
        status: "scheduled",
        scheduled_at: addDays(new Date(recoveryCase.first_failed_at), offset).toISOString(),
        amount_cents: recoveryCase.amount_cents,
        stripe_invoice_id: recoveryCase.stripe_invoice_id,
        stripe_payment_intent_id: recoveryCase.stripe_payment_intent_id,
        idempotency_key: `${recoveryCase.payment_id}:seed-retry:${index + 1}`
      });
    });
  }

  const { error: attemptsError } = await supabase
    .from("billing_recovery_attempts")
    .insert(attempts);

  if (attemptsError) throw attemptsError;

  return {
    cases: insertedCases?.length ?? 0,
    attempts: attempts.length
  };
}

async function main() {
  const supabase = makeSupabaseClient();
  const gym = await getTargetGym(supabase);
  console.log(`Seeding billing recovery for ${gym.name} (${gym.slug})...`);

  await clearPreviousSeed(supabase, gym.id);
  const policy = await ensurePolicy(supabase, gym.id);
  const subscriptions = await getSubscriptions(supabase, gym.id);
  const payments = await insertPayments(supabase, gym.id, subscriptions);
  const recovery = await insertCasesAndAttempts(supabase, policy, payments);

  console.log(
    JSON.stringify(
      {
        gym: gym.slug,
        payments: payments.length,
        recoveryCases: recovery.cases,
        retryAttempts: recovery.attempts
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
