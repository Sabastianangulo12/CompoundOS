"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ensureRecoveryCaseForPayment,
  ensureBillingRetryPolicy,
  getPaymentByIdForGym,
  getRecoveryCaseByIdForGym,
  issuePaymentRefund,
  markBillingRecoveryResolved,
  retryBillingRecoveryCase,
  sendBillingRecoveryReminder,
  syncBillingRecoveryQueue
} from "@/lib/billing-recovery";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PaymentStatus = Database["public"]["Tables"]["payments"]["Row"]["status"];
type PaymentType = Database["public"]["Tables"]["payments"]["Row"]["payment_type"];

const editablePaymentStatuses = new Set<PaymentStatus>([
  "failed",
  "pending",
  "scheduled",
  "overdue"
]);
const operatorPaymentStatuses = new Set<PaymentStatus>([
  "failed",
  "pending",
  "scheduled",
  "overdue",
  "succeeded"
]);
const paymentTypes = new Set<PaymentType>([
  "membership",
  "drop_in",
  "pos",
  "class_fee",
  "manual",
  "refund_adjustment"
]);

function billingRecoveryMessage(message: string) {
  return `/dashboard/billing-recovery?message=${encodeURIComponent(message)}`;
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(String(value ?? "").trim());

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseOffsets(value: FormDataEntryValue | null, fallback: number[]) {
  const offsets = String(value ?? "")
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 60);

  return offsets.length > 0 ? Array.from(new Set(offsets)).sort((a, b) => a - b) : fallback;
}

function parseCurrencyToCents(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function parseNonNegativeCurrencyToCents(
  value: FormDataEntryValue | null,
  fallback = 0
) {
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "").trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed * 100);
}

function parseDateToIso(value: FormDataEntryValue | null, fallbackIso: string | null) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return fallbackIso;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return fallbackIso;
  }

  return date.toISOString();
}

function parseOperatorPaymentStatus(
  value: FormDataEntryValue | null,
  fallback: PaymentStatus
) {
  const raw = String(value ?? "").trim() as PaymentStatus;
  return operatorPaymentStatuses.has(raw) ? raw : fallback;
}

function parsePaymentType(value: FormDataEntryValue | null, fallback: PaymentType) {
  const raw = String(value ?? "").trim() as PaymentType;
  return paymentTypes.has(raw) ? raw : fallback;
}

function sanitizeShortText(value: FormDataEntryValue | null, fallback = "") {
  const raw = String(value ?? "").trim();
  return (raw || fallback).slice(0, 180);
}

async function requireGymContext() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  return {
    supabase,
    currentGym: currentGym.data
  };
}

async function resolveOpenRecoveryCaseForPayment(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  gymId: string,
  paymentId: string,
  note: string
) {
  const { data, error } = await supabase
    .from("billing_recovery_cases")
    .select("*")
    .eq("gym_id", gymId)
    .eq("payment_id", paymentId)
    .in("status", ["open", "retrying", "waiting_on_member"])
    .maybeSingle();

  if (error || !data) {
    return;
  }

  await markBillingRecoveryResolved(supabase, data, note);
}

export async function syncBillingRecoveryQueueAction() {
  const { supabase, currentGym } = await requireGymContext();

  try {
    const result = await syncBillingRecoveryQueue(
      supabase,
      currentGym.membership.gymId
    );
    revalidatePath("/dashboard/billing-recovery");
    revalidatePath("/dashboard/revenue");
    redirect(
      billingRecoveryMessage(
        `Recovery queue synced: ${result.createdOrUpdated} cases reviewed.`
      )
    );
  } catch (error) {
    redirect(
      billingRecoveryMessage(
        error instanceof Error ? error.message : "Recovery sync failed."
      )
    );
  }
}

export async function updateBillingRetryPolicyAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const policy = await ensureBillingRetryPolicy(supabase, currentGym.membership.gymId);
  const retryOffsets = parseOffsets(formData.get("retryOffsets"), [2, 4, 7]);
  const reminderOffsets = parseOffsets(formData.get("reminderOffsets"), [0, 2, 4, 7]);
  const maxAttempts = parsePositiveInt(formData.get("maxAttempts"), 3);
  const finalNoticeAfterDays = parsePositiveInt(formData.get("finalNoticeAfterDays"), 10);

  const { error } = await supabase
    .from("billing_retry_policies")
    .update({
      retry_offsets_days: retryOffsets,
      reminder_offsets_days: reminderOffsets,
      max_attempts: Math.min(maxAttempts, 10),
      final_notice_after_days: finalNoticeAfterDays,
      auto_retry_enabled: formData.get("autoRetryEnabled") === "on",
      member_notifications_enabled: formData.get("memberNotificationsEnabled") === "on",
      daily_report_enabled: formData.get("dailyReportEnabled") === "on"
    })
    .eq("id", policy.id)
    .eq("gym_id", currentGym.membership.gymId);

  if (error) {
    redirect(billingRecoveryMessage(error.message));
  }

  revalidatePath("/dashboard/billing-recovery");
  redirect(billingRecoveryMessage("Billing retry policy updated."));
}

export async function createPaymentChargeAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const amountCents = parseCurrencyToCents(formData.get("amount"));
  const status = parseOperatorPaymentStatus(formData.get("status"), "scheduled");
  const now = new Date().toISOString();
  const dueAt = parseDateToIso(formData.get("dueAt"), status === "succeeded" ? now : now);
  const invoiceNumber = sanitizeShortText(
    formData.get("invoiceNumber"),
    `MAN-${Date.now()}`
  );

  if (!memberId || amountCents === null) {
    redirect(billingRecoveryMessage("Member and valid charge amount are required."));
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      gym_id: currentGym.membership.gymId,
      member_id: memberId,
      subscription_id: null,
      amount_cents: amountCents,
      status,
      paid_at: status === "succeeded" ? now : null,
      due_at: dueAt,
      invoice_number: invoiceNumber,
      description: sanitizeShortText(formData.get("description"), "Manual charge"),
      payment_type: parsePaymentType(formData.get("paymentType"), "manual"),
      accounting_category: sanitizeShortText(formData.get("accountingCategory"), "manual"),
      late_fee_cents: parseNonNegativeCurrencyToCents(formData.get("lateFee")),
      tax_cents: parseNonNegativeCurrencyToCents(formData.get("tax")),
      discount_cents: parseNonNegativeCurrencyToCents(formData.get("discount")),
      manual_payment_note: sanitizeShortText(formData.get("note")) || null,
      payment_method_label: sanitizeShortText(formData.get("paymentMethod"), "Manual")
    })
    .select("*")
    .single();

  if (error || !data) {
    redirect(billingRecoveryMessage(error?.message ?? "Charge could not be created."));
  }

  if (status === "failed" || status === "overdue") {
    await ensureRecoveryCaseForPayment(supabase, data);
  }

  revalidatePath("/dashboard/billing-recovery");
  revalidatePath("/dashboard/revenue");
  redirect(billingRecoveryMessage("Payment charge created."));
}

export async function updatePaymentChargeAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const amountCents = parseCurrencyToCents(formData.get("amount"));

  if (!paymentId || amountCents === null) {
    redirect(billingRecoveryMessage("Payment and valid amount are required."));
  }

  const payment = await getPaymentByIdForGym(
    supabase,
    currentGym.membership.gymId,
    paymentId
  );

  if (!editablePaymentStatuses.has(payment.status)) {
    redirect(
      billingRecoveryMessage(
        "Only failed, pending, scheduled, or overdue payments can be edited."
      )
    );
  }

  const nextStatus = parseOperatorPaymentStatus(formData.get("status"), payment.status);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payments")
    .update({
      amount_cents: amountCents,
      status: nextStatus,
      paid_at: nextStatus === "succeeded" ? now : null,
      due_at: parseDateToIso(formData.get("dueAt"), payment.due_at),
      invoice_number: sanitizeShortText(formData.get("invoiceNumber")) || null,
      description: sanitizeShortText(formData.get("description")) || null,
      payment_type: parsePaymentType(formData.get("paymentType"), payment.payment_type),
      accounting_category: sanitizeShortText(
        formData.get("accountingCategory"),
        payment.accounting_category
      ),
      late_fee_cents: parseNonNegativeCurrencyToCents(
        formData.get("lateFee"),
        payment.late_fee_cents
      ),
      tax_cents: parseNonNegativeCurrencyToCents(formData.get("tax"), payment.tax_cents),
      discount_cents: parseNonNegativeCurrencyToCents(
        formData.get("discount"),
        payment.discount_cents
      ),
      manual_payment_note: sanitizeShortText(formData.get("note")) || null,
      payment_method_label: sanitizeShortText(formData.get("paymentMethod")) || null
    })
    .eq("id", payment.id)
    .eq("gym_id", currentGym.membership.gymId)
    .select("*")
    .single();

  if (error || !data) {
    redirect(billingRecoveryMessage(error?.message ?? "Payment could not be updated."));
  }

  if (nextStatus === "failed" || nextStatus === "overdue") {
    await ensureRecoveryCaseForPayment(supabase, data);
  }

  if (nextStatus === "succeeded") {
    await resolveOpenRecoveryCaseForPayment(
      supabase,
      currentGym.membership.gymId,
      payment.id,
      "Payment marked paid by staff."
    );
  }

  revalidatePath("/dashboard/billing-recovery");
  revalidatePath("/dashboard/revenue");
  redirect(billingRecoveryMessage("Payment updated."));
}

export async function applyPaymentLateFeeAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const lateFeeCents = parseCurrencyToCents(formData.get("lateFee"));

  if (!paymentId || lateFeeCents === null) {
    redirect(billingRecoveryMessage("Payment and valid late fee are required."));
  }

  const payment = await getPaymentByIdForGym(
    supabase,
    currentGym.membership.gymId,
    paymentId
  );

  if (!editablePaymentStatuses.has(payment.status)) {
    redirect(billingRecoveryMessage("Late fees can only be added to open payments."));
  }

  const { data, error } = await supabase
    .from("payments")
    .update({
      amount_cents: payment.amount_cents + lateFeeCents,
      late_fee_cents: payment.late_fee_cents + lateFeeCents,
      description: payment.description
        ? `${payment.description} + late fee`
        : "Late fee applied"
    })
    .eq("id", payment.id)
    .eq("gym_id", currentGym.membership.gymId)
    .select("*")
    .single();

  if (error || !data) {
    redirect(billingRecoveryMessage(error?.message ?? "Late fee could not be applied."));
  }

  if (data.status === "failed" || data.status === "overdue") {
    await ensureRecoveryCaseForPayment(supabase, data);
  }

  revalidatePath("/dashboard/billing-recovery");
  revalidatePath("/dashboard/revenue");
  redirect(billingRecoveryMessage("Late fee applied."));
}

export async function markPaymentPaidAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const paymentId = String(formData.get("paymentId") ?? "").trim();

  if (!paymentId) {
    redirect(billingRecoveryMessage("Payment is required."));
  }

  const payment = await getPaymentByIdForGym(
    supabase,
    currentGym.membership.gymId,
    paymentId
  );

  if (payment.status === "refunded") {
    redirect(billingRecoveryMessage("Refunded payments cannot be marked paid."));
  }

  const { data, error } = await supabase
    .from("payments")
    .update({
      status: "succeeded",
      paid_at: new Date().toISOString(),
      payment_method_label: sanitizeShortText(formData.get("paymentMethod"), "Manual")
    })
    .eq("id", payment.id)
    .eq("gym_id", currentGym.membership.gymId)
    .select("id")
    .single();

  if (error || !data) {
    redirect(billingRecoveryMessage(error?.message ?? "Payment could not be updated."));
  }

  await resolveOpenRecoveryCaseForPayment(
    supabase,
    currentGym.membership.gymId,
    payment.id,
    "Payment marked paid by staff."
  );

  revalidatePath("/dashboard/billing-recovery");
  revalidatePath("/dashboard/revenue");
  redirect(billingRecoveryMessage("Payment marked paid."));
}

export async function retryRecoveryCaseAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const caseId = String(formData.get("caseId") ?? "").trim();

  if (!caseId) {
    redirect(billingRecoveryMessage("Recovery case is required."));
  }

  try {
    const recoveryCase = await getRecoveryCaseByIdForGym(
      supabase,
      currentGym.membership.gymId,
      caseId
    );
    const result = await retryBillingRecoveryCase(supabase, recoveryCase);
    revalidatePath("/dashboard/billing-recovery");
    revalidatePath("/dashboard/revenue");
    redirect(billingRecoveryMessage(`Retry processed: ${result.status ?? "submitted"}.`));
  } catch (error) {
    redirect(
      billingRecoveryMessage(
        error instanceof Error ? error.message : "Retry could not be processed."
      )
    );
  }
}

export async function sendRecoveryReminderAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const caseId = String(formData.get("caseId") ?? "").trim();
  const finalNotice = formData.get("finalNotice") === "true";

  if (!caseId) {
    redirect(billingRecoveryMessage("Recovery case is required."));
  }

  try {
    const recoveryCase = await getRecoveryCaseByIdForGym(
      supabase,
      currentGym.membership.gymId,
      caseId
    );
    await sendBillingRecoveryReminder(supabase, recoveryCase, {
      finalNotice
    });
    revalidatePath("/dashboard/billing-recovery");
    redirect(
      billingRecoveryMessage(finalNotice ? "Final notice sent." : "Reminder sent.")
    );
  } catch (error) {
    redirect(
      billingRecoveryMessage(
        error instanceof Error ? error.message : "Reminder could not be sent."
      )
    );
  }
}

export async function resolveRecoveryCaseAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const caseId = String(formData.get("caseId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!caseId) {
    redirect(billingRecoveryMessage("Recovery case is required."));
  }

  try {
    const recoveryCase = await getRecoveryCaseByIdForGym(
      supabase,
      currentGym.membership.gymId,
      caseId
    );
    await markBillingRecoveryResolved(
      supabase,
      recoveryCase,
      note || "Manually resolved by staff."
    );
    revalidatePath("/dashboard/billing-recovery");
    revalidatePath("/dashboard/revenue");
    redirect(billingRecoveryMessage("Recovery case resolved."));
  } catch (error) {
    redirect(
      billingRecoveryMessage(
        error instanceof Error ? error.message : "Recovery case could not be resolved."
      )
    );
  }
}

export async function issuePaymentRefundAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const paymentId = String(formData.get("paymentId") ?? "").trim();
  const amountCents = parseCurrencyToCents(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!paymentId || amountCents === null) {
    redirect(billingRecoveryMessage("Payment and valid refund amount are required."));
  }

  try {
    const payment = await getPaymentByIdForGym(
      supabase,
      currentGym.membership.gymId,
      paymentId
    );
    await issuePaymentRefund(supabase, {
      payment,
      amountCents,
      reason: reason || "Requested by customer"
    });
    revalidatePath("/dashboard/billing-recovery");
    revalidatePath("/dashboard/revenue");
    redirect(billingRecoveryMessage("Refund recorded."));
  } catch (error) {
    redirect(
      billingRecoveryMessage(
        error instanceof Error ? error.message : "Refund could not be recorded."
      )
    );
  }
}
