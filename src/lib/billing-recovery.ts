import type Stripe from "stripe";
import { hasStripeServerEnv } from "@/lib/env";
import { createAndSendMemberNotification } from "@/lib/notifications";
import { formatCurrencyFromCents } from "@/lib/revenue";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getStripe } from "@/lib/stripe/server";
import type { Database } from "@/types/database";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type MemberRow = Database["public"]["Tables"]["members"]["Row"];
type RecoveryCaseRow =
  Database["public"]["Tables"]["billing_recovery_cases"]["Row"];
type RetryPolicyRow =
  Database["public"]["Tables"]["billing_retry_policies"]["Row"];
type RecoveryCaseReason =
  Database["public"]["Tables"]["billing_recovery_cases"]["Row"]["reason"];

export type BillingRecoveryCaseWithRelations = RecoveryCaseRow & {
  members:
    | Pick<MemberRow, "id" | "first_name" | "last_name" | "email" | "stripe_default_payment_method_id" | "stripe_customer_id">
    | Pick<MemberRow, "id" | "first_name" | "last_name" | "email" | "stripe_default_payment_method_id" | "stripe_customer_id">[]
    | null;
  payments: Pick<
    PaymentRow,
    | "id"
    | "amount_cents"
    | "status"
    | "paid_at"
    | "due_at"
    | "invoice_number"
    | "stripe_invoice_id"
    | "stripe_payment_intent_id"
    | "refunded_amount_cents"
  > | null;
  subscriptions: Pick<
    SubscriptionRow,
    "id" | "status" | "current_period_end" | "stripe_subscription_id"
  > | null;
  billing_recovery_attempts: Array<
    Database["public"]["Tables"]["billing_recovery_attempts"]["Row"]
  > | null;
};

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getBillingRecoveryStatusLabel(status: RecoveryCaseRow["status"]) {
  return status.replaceAll("_", " ");
}

export function getBillingRecoveryReasonLabel(reason: RecoveryCaseReason) {
  return reason.replaceAll("_", " ");
}

export async function ensureBillingRetryPolicy(
  supabase: AppSupabaseClient,
  gymId: string
) {
  const existing = await supabase
    .from("billing_retry_policies")
    .select("*")
    .eq("gym_id", gymId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data as RetryPolicyRow;
  }

  const { data, error } = await supabase
    .from("billing_retry_policies")
    .insert({
      gym_id: gymId
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Billing retry policy could not be created.");
  }

  return data as RetryPolicyRow;
}

export function calculateNextRetryAt(
  firstFailedAt: string | null,
  retryCount: number,
  policy: Pick<RetryPolicyRow, "retry_offsets_days">
) {
  const offsets = [...policy.retry_offsets_days].sort((a, b) => a - b);
  const offset = offsets[retryCount] ?? null;

  if (offset === null) {
    return null;
  }

  const base = firstFailedAt ? new Date(firstFailedAt) : new Date();

  if (Number.isNaN(base.getTime())) {
    return addDays(new Date(), offset).toISOString();
  }

  return addDays(base, offset).toISOString();
}

export async function ensureRecoveryCaseForPayment(
  supabase: AppSupabaseClient,
  payment: PaymentRow,
  policy?: RetryPolicyRow
) {
  if (!payment.member_id) {
    return null;
  }

  const retryPolicy = policy ?? (await ensureBillingRetryPolicy(supabase, payment.gym_id));
  const firstFailedAt =
    payment.paid_at ?? payment.due_at ?? payment.created_at ?? new Date().toISOString();
  const nextRetryAt = calculateNextRetryAt(firstFailedAt, 0, retryPolicy);
  const existing = await supabase
    .from("billing_recovery_cases")
    .select("*")
    .eq("payment_id", payment.id)
    .in("status", ["open", "retrying", "waiting_on_member"])
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const payload = {
    gym_id: payment.gym_id,
    member_id: payment.member_id,
    subscription_id: payment.subscription_id,
    payment_id: payment.id,
    reason: payment.status === "overdue" ? "overdue_payment" : "failed_payment",
    status: "open",
    priority: payment.amount_cents >= 10000 ? "critical" : "high",
    amount_cents: payment.amount_cents,
    max_retries: retryPolicy.max_attempts,
    first_failed_at: firstFailedAt,
    next_retry_at: nextRetryAt,
    stripe_invoice_id: payment.stripe_invoice_id,
    stripe_payment_intent_id: payment.stripe_payment_intent_id
  } satisfies Database["public"]["Tables"]["billing_recovery_cases"]["Insert"];

  const caseResult = existing.data
    ? await supabase
        .from("billing_recovery_cases")
        .update({
          amount_cents: payload.amount_cents,
          priority: payload.priority,
          max_retries: payload.max_retries,
          next_retry_at: existing.data.next_retry_at ?? payload.next_retry_at,
          stripe_invoice_id: payload.stripe_invoice_id,
          stripe_payment_intent_id: payload.stripe_payment_intent_id
        })
        .eq("id", existing.data.id)
        .select("*")
        .single()
    : await supabase.from("billing_recovery_cases").insert(payload).select("*").single();

  if (caseResult.error || !caseResult.data) {
    throw new Error(caseResult.error?.message ?? "Recovery case could not be saved.");
  }

  await ensureScheduledRetryAttempts(supabase, caseResult.data, retryPolicy);

  return caseResult.data as RecoveryCaseRow;
}

export async function ensureRecoveryCaseForMemberIssue(
  supabase: AppSupabaseClient,
  input: {
    gymId: string;
    memberId: string;
    subscriptionId?: string | null;
    reason: Extract<RecoveryCaseReason, "past_due_subscription" | "missing_card">;
    amountCents?: number;
  }
) {
  const existing = await supabase
    .from("billing_recovery_cases")
    .select("*")
    .eq("gym_id", input.gymId)
    .eq("member_id", input.memberId)
    .eq("reason", input.reason)
    .in("status", ["open", "retrying", "waiting_on_member"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data as RecoveryCaseRow;
  }

  const policy = await ensureBillingRetryPolicy(supabase, input.gymId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("billing_recovery_cases")
    .insert({
      gym_id: input.gymId,
      member_id: input.memberId,
      subscription_id: input.subscriptionId ?? null,
      reason: input.reason,
      status: input.reason === "missing_card" ? "waiting_on_member" : "open",
      priority: input.reason === "missing_card" ? "high" : "critical",
      amount_cents: input.amountCents ?? 0,
      max_retries: policy.max_attempts,
      first_failed_at: now,
      next_retry_at:
        input.reason === "missing_card" ? null : calculateNextRetryAt(now, 0, policy)
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Recovery case could not be created.");
  }

  return data as RecoveryCaseRow;
}

async function ensureScheduledRetryAttempts(
  supabase: AppSupabaseClient,
  recoveryCase: RecoveryCaseRow,
  policy: RetryPolicyRow
) {
  if (!recoveryCase.payment_id || !recoveryCase.member_id) {
    return;
  }

  const firstFailedAt =
    recoveryCase.first_failed_at ?? recoveryCase.created_at ?? new Date().toISOString();
  const offsets = [...policy.retry_offsets_days].sort((a, b) => a - b);
  const attempts = offsets.slice(0, policy.max_attempts).map((offset, index) => ({
    gym_id: recoveryCase.gym_id,
    case_id: recoveryCase.id,
    payment_id: recoveryCase.payment_id,
    member_id: recoveryCase.member_id,
    attempt_number: index + 1,
    action: "retry_charge" as const,
    status: "scheduled" as const,
    scheduled_at: addDays(new Date(firstFailedAt), offset).toISOString(),
    amount_cents: recoveryCase.amount_cents,
    stripe_invoice_id: recoveryCase.stripe_invoice_id,
    stripe_payment_intent_id: recoveryCase.stripe_payment_intent_id,
    idempotency_key: `${recoveryCase.payment_id}:retry:${index + 1}`
  }));

  for (const attempt of attempts) {
    const { error } = await supabase
      .from("billing_recovery_attempts")
      .upsert(attempt, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true
      });

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function syncBillingRecoveryQueue(
  supabase: AppSupabaseClient,
  gymId: string
) {
  const policy = await ensureBillingRetryPolicy(supabase, gymId);
  let createdOrUpdated = 0;

  const failedPaymentsResult = await supabase
    .from("payments")
    .select("*")
    .eq("gym_id", gymId)
    .in("status", ["failed", "overdue"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (failedPaymentsResult.error) {
    throw new Error(failedPaymentsResult.error.message);
  }

  for (const payment of failedPaymentsResult.data ?? []) {
    const recoveryCase = await ensureRecoveryCaseForPayment(
      supabase,
      payment as PaymentRow,
      policy
    );
    createdOrUpdated += recoveryCase ? 1 : 0;
  }

  const pastDueResult = await supabase
    .from("subscriptions")
    .select("id, gym_id, member_id, membership_plan_id, status, current_period_end, membership_plans ( price_cents )")
    .eq("gym_id", gymId)
    .eq("status", "past_due")
    .limit(500);

  if (pastDueResult.error) {
    throw new Error(pastDueResult.error.message);
  }

  for (const subscription of pastDueResult.data ?? []) {
    const plan = Array.isArray(subscription.membership_plans)
      ? subscription.membership_plans[0] ?? null
      : subscription.membership_plans;
    await ensureRecoveryCaseForMemberIssue(supabase, {
      gymId,
      memberId: subscription.member_id,
      subscriptionId: subscription.id,
      reason: "past_due_subscription",
      amountCents: plan?.price_cents ?? 0
    });
    createdOrUpdated += 1;
  }

  const missingCardResult = await supabase
    .from("subscriptions")
    .select(
      "id, gym_id, member_id, status, members ( id, stripe_customer_id, stripe_default_payment_method_id )"
    )
    .eq("gym_id", gymId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(800);

  if (missingCardResult.error) {
    throw new Error(missingCardResult.error.message);
  }

  for (const subscription of missingCardResult.data ?? []) {
    const member = Array.isArray(subscription.members)
      ? subscription.members[0] ?? null
      : subscription.members;

    if (!member) {
      continue;
    }

    if (!member.stripe_customer_id && !member.stripe_default_payment_method_id) {
      await ensureRecoveryCaseForMemberIssue(supabase, {
        gymId,
        memberId: subscription.member_id,
        subscriptionId: subscription.id,
        reason: "missing_card"
      });
      createdOrUpdated += 1;
    }
  }

  const report = await createBillingDailyReport(supabase, gymId);

  return {
    policy,
    createdOrUpdated,
    report
  };
}

export async function sendBillingRecoveryReminder(
  supabase: AppSupabaseClient,
  recoveryCase: RecoveryCaseRow,
  options?: {
    finalNotice?: boolean;
  }
) {
  if (!recoveryCase.member_id) {
    throw new Error("Recovery case is not linked to a member.");
  }

  const memberResult = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("gym_id", recoveryCase.gym_id)
    .eq("id", recoveryCase.member_id)
    .maybeSingle();

  if (memberResult.error || !memberResult.data) {
    throw new Error(memberResult.error?.message ?? "Member not found.");
  }

  const amount = formatCurrencyFromCents(recoveryCase.amount_cents);
  const finalNotice = options?.finalNotice ?? false;
  const title = finalNotice
    ? "Final notice: membership billing needs attention"
    : "Membership billing needs attention";
  const body = finalNotice
    ? `Hi ${memberResult.data.first_name}, this is a final billing notice for ${amount}. Please update your payment method or contact the gym to keep your membership active.`
    : `Hi ${memberResult.data.first_name}, your membership billing needs attention${recoveryCase.amount_cents > 0 ? ` for ${amount}` : ""}. Please update your payment method or contact the gym.`;

  await createAndSendMemberNotification(supabase, {
    gymId: recoveryCase.gym_id,
    memberId: recoveryCase.member_id,
    title,
    body,
    type: "billing"
  });

  const now = new Date().toISOString();
  const { error: attemptError } = await supabase.from("billing_recovery_attempts").insert({
    gym_id: recoveryCase.gym_id,
    case_id: recoveryCase.id,
    payment_id: recoveryCase.payment_id,
    member_id: recoveryCase.member_id,
    attempt_number: recoveryCase.retry_count + 1,
    action: finalNotice ? "final_notice" : "send_reminder",
    status: "succeeded",
    processed_at: now,
    amount_cents: recoveryCase.amount_cents,
    result_message: finalNotice ? "Final billing notice sent." : "Billing reminder sent."
  });

  if (attemptError) {
    throw new Error(attemptError.message);
  }

  const { error: updateError } = await supabase
    .from("billing_recovery_cases")
    .update({
      status: "waiting_on_member",
      last_reminder_at: now,
      final_notice_at: finalNotice ? now : recoveryCase.final_notice_at
    })
    .eq("id", recoveryCase.id)
    .eq("gym_id", recoveryCase.gym_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    sentAt: now
  };
}

export async function retryBillingRecoveryCase(
  supabase: AppSupabaseClient,
  recoveryCase: RecoveryCaseRow
) {
  if (!hasStripeServerEnv()) {
    throw new Error("Stripe is not configured for retry processing.");
  }

  if (!recoveryCase.stripe_invoice_id) {
    await recordRecoveryAttempt(supabase, recoveryCase, {
      action: "retry_charge",
      status: "skipped",
      resultMessage: "No Stripe invoice is attached to this recovery case."
    });
    throw new Error("This case does not have a Stripe invoice to retry.");
  }

  const stripe = getStripe();
  const attemptNumber = recoveryCase.retry_count + 1;
  const idempotencyKey = `${recoveryCase.id}:retry-now:${attemptNumber}`;
  await recordRecoveryAttempt(supabase, recoveryCase, {
    action: "retry_charge",
    status: "processing",
    resultMessage: "Retry started.",
    idempotencyKey
  });

  try {
    const invoice = await stripe.invoices.pay(recoveryCase.stripe_invoice_id, {
      idempotencyKey
    } as Stripe.RequestOptions);
    const succeeded = invoice.status === "paid";
    const now = new Date().toISOString();

    await supabase.from("billing_recovery_attempts").insert({
      gym_id: recoveryCase.gym_id,
      case_id: recoveryCase.id,
      payment_id: recoveryCase.payment_id,
      member_id: recoveryCase.member_id,
      attempt_number: attemptNumber,
      action: "retry_charge",
      status: succeeded ? "succeeded" : "failed",
      processed_at: now,
      amount_cents: recoveryCase.amount_cents,
      result_message: `Stripe invoice retry returned ${invoice.status ?? "unknown"}.`,
      stripe_invoice_id: recoveryCase.stripe_invoice_id,
      stripe_payment_intent_id: recoveryCase.stripe_payment_intent_id,
      idempotency_key: `${idempotencyKey}:result`
    });

    await supabase
      .from("billing_recovery_cases")
      .update({
        status: succeeded ? "resolved" : "retrying",
        retry_count: attemptNumber,
        last_retry_at: now,
        resolved_at: succeeded ? now : null,
        resolution_note: succeeded ? "Stripe invoice retry succeeded." : null,
        next_retry_at: succeeded
          ? null
          : calculateNextRetryAt(
              recoveryCase.first_failed_at,
              attemptNumber,
              await ensureBillingRetryPolicy(supabase, recoveryCase.gym_id)
            )
      })
      .eq("id", recoveryCase.id)
      .eq("gym_id", recoveryCase.gym_id);

    return {
      status: invoice.status
    };
  } catch (error) {
    await recordRecoveryAttempt(supabase, recoveryCase, {
      action: "retry_charge",
      status: "failed",
      resultMessage: error instanceof Error ? error.message : "Stripe retry failed.",
      idempotencyKey: `${idempotencyKey}:failed`
    });
    throw error;
  }
}

async function recordRecoveryAttempt(
  supabase: AppSupabaseClient,
  recoveryCase: RecoveryCaseRow,
  input: {
    action: Database["public"]["Tables"]["billing_recovery_attempts"]["Row"]["action"];
    status: Database["public"]["Tables"]["billing_recovery_attempts"]["Row"]["status"];
    resultMessage: string;
    idempotencyKey?: string;
  }
) {
  const { error } = await supabase.from("billing_recovery_attempts").insert({
    gym_id: recoveryCase.gym_id,
    case_id: recoveryCase.id,
    payment_id: recoveryCase.payment_id,
    member_id: recoveryCase.member_id,
    attempt_number: recoveryCase.retry_count + 1,
    action: input.action,
    status: input.status,
    processed_at: new Date().toISOString(),
    amount_cents: recoveryCase.amount_cents,
    result_message: input.resultMessage,
    stripe_invoice_id: recoveryCase.stripe_invoice_id,
    stripe_payment_intent_id: recoveryCase.stripe_payment_intent_id,
    idempotency_key: input.idempotencyKey
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

export async function markBillingRecoveryResolved(
  supabase: AppSupabaseClient,
  recoveryCase: RecoveryCaseRow,
  note: string
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("billing_recovery_cases")
    .update({
      status: "resolved",
      resolved_at: now,
      resolution_note: note || "Manually marked resolved."
    })
    .eq("id", recoveryCase.id)
    .eq("gym_id", recoveryCase.gym_id);

  if (error) {
    throw new Error(error.message);
  }

  await recordRecoveryAttempt(supabase, recoveryCase, {
    action: "mark_resolved",
    status: "succeeded",
    resultMessage: note || "Manually marked resolved."
  });

  return {
    resolvedAt: now
  };
}

export async function issuePaymentRefund(
  supabase: AppSupabaseClient,
  input: {
    payment: PaymentRow;
    amountCents: number;
    reason: string;
  }
) {
  if (input.amountCents <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  const refundableRemaining =
    input.payment.amount_cents - input.payment.refunded_amount_cents;

  if (input.amountCents > refundableRemaining) {
    throw new Error("Refund amount exceeds the refundable payment balance.");
  }

  let stripeRefundId: string | null = null;

  if (input.payment.stripe_payment_intent_id && hasStripeServerEnv()) {
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.payment.stripe_payment_intent_id,
        amount: input.amountCents,
        reason: "requested_by_customer",
        metadata: {
          gymId: input.payment.gym_id,
          paymentId: input.payment.id
        }
      },
      {
        idempotencyKey: `${input.payment.id}:refund:${input.amountCents}:${input.reason}`
      }
    );
    stripeRefundId = refund.id;
  }

  const nextRefundedAmount = input.payment.refunded_amount_cents + input.amountCents;
  const fullyRefunded = nextRefundedAmount >= input.payment.amount_cents;
  const { data, error } = await supabase
    .from("payments")
    .update({
      status: fullyRefunded ? "refunded" : input.payment.status,
      refunded_amount_cents: nextRefundedAmount,
      refunded_at: new Date().toISOString(),
      refund_reason: input.reason,
      stripe_refund_id: stripeRefundId
    })
    .eq("id", input.payment.id)
    .eq("gym_id", input.payment.gym_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Refund could not be recorded.");
  }

  return data as PaymentRow;
}

export async function createBillingDailyReport(
  supabase: AppSupabaseClient,
  gymId: string,
  reportDate = new Date().toISOString().slice(0, 10)
) {
  const dayStart = `${reportDate}T00:00:00.000Z`;
  const dayEndDate = addDays(new Date(dayStart), 1);
  const dayEnd = dayEndDate.toISOString();
  const [
    paidResult,
    failedResult,
    overdueResult,
    refundedResult,
    openCasesResult,
    dueRetriesResult
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_cents")
      .eq("gym_id", gymId)
      .eq("status", "succeeded")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd),
    supabase
      .from("payments")
      .select("amount_cents")
      .eq("gym_id", gymId)
      .eq("status", "failed")
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd),
    supabase
      .from("payments")
      .select("amount_cents")
      .eq("gym_id", gymId)
      .eq("status", "overdue"),
    supabase
      .from("payments")
      .select("refunded_amount_cents")
      .eq("gym_id", gymId)
      .eq("status", "refunded")
      .gte("refunded_at", dayStart)
      .lt("refunded_at", dayEnd),
    supabase
      .from("billing_recovery_cases")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .in("status", ["open", "retrying", "waiting_on_member"]),
    supabase
      .from("billing_recovery_attempts")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
  ]);

  const errors = [
    paidResult.error,
    failedResult.error,
    overdueResult.error,
    refundedResult.error,
    openCasesResult.error,
    dueRetriesResult.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Daily report could not be generated.");
  }

  const sum = (rows: Array<{ amount_cents?: number | null }> | null) =>
    (rows ?? []).reduce((total, row) => total + (row.amount_cents ?? 0), 0);
  const refundSum = (rows: Array<{ refunded_amount_cents?: number | null }> | null) =>
    (rows ?? []).reduce((total, row) => total + (row.refunded_amount_cents ?? 0), 0);

  const metrics = {
    paid_count: paidResult.data?.length ?? 0,
    paid_cents: sum(paidResult.data),
    failed_count: failedResult.data?.length ?? 0,
    failed_cents: sum(failedResult.data),
    overdue_count: overdueResult.data?.length ?? 0,
    overdue_cents: sum(overdueResult.data),
    refunded_cents: refundSum(refundedResult.data),
    open_recovery_cases: openCasesResult.count ?? 0,
    due_retries: dueRetriesResult.count ?? 0
  };

  const { data, error } = await supabase
    .from("billing_daily_reports")
    .upsert(
      {
        gym_id: gymId,
        report_date: reportDate,
        metrics
      },
      {
        onConflict: "gym_id,report_date"
      }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Daily report could not be saved.");
  }

  return data;
}

export async function getPaymentByIdForGym(
  supabase: AppSupabaseClient,
  gymId: string,
  paymentId: string
) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("gym_id", gymId)
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Payment not found.");
  }

  return data as PaymentRow;
}

export async function getRecoveryCaseByIdForGym(
  supabase: AppSupabaseClient,
  gymId: string,
  caseId: string
) {
  const { data, error } = await supabase
    .from("billing_recovery_cases")
    .select("*")
    .eq("gym_id", gymId)
    .eq("id", caseId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Recovery case not found.");
  }

  return data as RecoveryCaseRow;
}
