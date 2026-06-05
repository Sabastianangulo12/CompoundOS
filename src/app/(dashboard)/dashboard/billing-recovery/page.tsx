import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  applyPaymentLateFeeAction,
  createPaymentChargeAction,
  issuePaymentRefundAction,
  markPaymentPaidAction,
  resolveRecoveryCaseAction,
  retryRecoveryCaseAction,
  sendRecoveryReminderAction,
  syncBillingRecoveryQueueAction,
  updatePaymentChargeAction,
  updateBillingRetryPolicyAction
} from "@/app/(dashboard)/dashboard/billing-recovery/actions";
import {
  ensureBillingRetryPolicy,
  getBillingRecoveryReasonLabel,
  getBillingRecoveryStatusLabel,
  type BillingRecoveryCaseWithRelations
} from "@/lib/billing-recovery";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { formatCurrencyFromCents } from "@/lib/revenue";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BillingRecoveryPageProps = {
  searchParams?: Promise<{
    message?: string;
    q?: string;
    status?: string;
  }>;
};

type PaymentStatus = Database["public"]["Tables"]["payments"]["Row"]["status"];
type PaymentFilter = PaymentStatus | "all";

type PaymentWithMember = Database["public"]["Tables"]["payments"]["Row"] & {
  members:
    | Pick<
        Database["public"]["Tables"]["members"]["Row"],
        "id" | "first_name" | "last_name" | "email"
      >
    | Pick<
        Database["public"]["Tables"]["members"]["Row"],
        "id" | "first_name" | "last_name" | "email"
      >[]
    | null;
};

type MemberOption = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  "id" | "first_name" | "last_name" | "email"
>;

const paymentStatusTabs: Array<{ label: string; value: PaymentFilter }> = [
  { label: "All", value: "all" },
  { label: "Paid", value: "succeeded" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Pending", value: "pending" },
  { label: "Overdue", value: "overdue" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" }
];

const editableStatuses = new Set<PaymentStatus>([
  "failed",
  "pending",
  "scheduled",
  "overdue"
]);

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatDateInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function getMemberName(
  member:
    | Pick<
        Database["public"]["Tables"]["members"]["Row"],
        "first_name" | "last_name"
      >
    | null
) {
  return member ? `${member.first_name} ${member.last_name}` : "No member";
}

function getMemberLabel(member: MemberOption) {
  return `${member.first_name} ${member.last_name} (${member.email})`;
}

function parsePaymentFilter(value: string | undefined): PaymentFilter {
  return paymentStatusTabs.some((tab) => tab.value === value)
    ? (value as PaymentFilter)
    : "all";
}

function normalizeSearchValue(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getStatusLink(status: PaymentFilter, q: string) {
  const params = new URLSearchParams();

  if (status !== "all") {
    params.set("status", status);
  }

  if (q) {
    params.set("q", q);
  }

  const query = params.toString();
  return query ? `/dashboard/billing-recovery?${query}` : "/dashboard/billing-recovery";
}

function paymentMatchesSearch(payment: PaymentWithMember, search: string) {
  if (!search) {
    return true;
  }

  const member = toOneRelation(payment.members);
  const values = [
    member ? `${member.first_name} ${member.last_name}` : "",
    member?.email,
    payment.invoice_number,
    payment.stripe_invoice_id,
    payment.stripe_payment_intent_id,
    payment.description,
    payment.payment_type,
    payment.accounting_category,
    payment.payment_method_label
  ];

  return values.some((value) => String(value ?? "").toLowerCase().includes(search));
}

export default async function BillingRecoveryPage({
  searchParams
}: BillingRecoveryPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const gymId = currentGym.data.membership.gymId;
  const statusFilter = parsePaymentFilter(resolvedSearchParams?.status);
  const paymentSearch = normalizeSearchValue(resolvedSearchParams?.q);
  const policy = await ensureBillingRetryPolicy(supabase, gymId);
  let paymentsQuery = supabase
    .from("payments")
    .select(
      `
        *,
        members (
          id,
          first_name,
          last_name,
          email
        )
      `
    )
    .eq("gym_id", gymId)
    .order("created_at", { ascending: false })
    .limit(paymentSearch ? 36 : 12);

  if (statusFilter !== "all") {
    paymentsQuery = paymentsQuery.eq("status", statusFilter);
  }

  const [
    casesResult,
    paymentsResult,
    reportsResult,
    dueAttemptsResult,
    openCasesCountResult,
    membersResult,
    paymentStatusRowsResult
  ] = await Promise.all([
    supabase
      .from("billing_recovery_cases")
      .select(
        `
          *,
          members (
            id,
            first_name,
            last_name,
            email,
            stripe_customer_id,
            stripe_default_payment_method_id
          ),
          payments (
            id,
            amount_cents,
            status,
            paid_at,
            due_at,
            invoice_number,
            stripe_invoice_id,
            stripe_payment_intent_id,
            refunded_amount_cents
          ),
          subscriptions (
            id,
            status,
            current_period_end,
            stripe_subscription_id
          ),
          billing_recovery_attempts (
            id,
            gym_id,
            case_id,
            payment_id,
            member_id,
            attempt_number,
            action,
            status,
            scheduled_at,
            processed_at,
            amount_cents,
            result_message,
            stripe_invoice_id,
            stripe_payment_intent_id,
            idempotency_key,
            created_at
          )
        `
      )
      .eq("gym_id", gymId)
      .in("status", ["open", "retrying", "waiting_on_member"])
      .order("priority", { ascending: false })
      .order("next_retry_at", { ascending: true, nullsFirst: false })
      .limit(8),
    paymentsQuery,
    supabase
      .from("billing_daily_reports")
      .select("*")
      .eq("gym_id", gymId)
      .order("report_date", { ascending: false })
      .limit(7),
    supabase
      .from("billing_recovery_attempts")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString()),
    supabase
      .from("billing_recovery_cases")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .in("status", ["open", "retrying", "waiting_on_member"]),
    supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("gym_id", gymId)
      .order("first_name", { ascending: true })
      .limit(50),
    supabase
      .from("payments")
      .select("status")
      .eq("gym_id", gymId)
      .limit(1000)
  ]);

  if (casesResult.error) {
    throw new Error(casesResult.error.message);
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  if (reportsResult.error) {
    throw new Error(reportsResult.error.message);
  }

  if (dueAttemptsResult.error) {
    throw new Error(dueAttemptsResult.error.message);
  }

  if (openCasesCountResult.error) {
    throw new Error(openCasesCountResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  if (paymentStatusRowsResult.error) {
    throw new Error(paymentStatusRowsResult.error.message);
  }

  const recoveryCases = (casesResult.data ?? []) as BillingRecoveryCaseWithRelations[];
  const payments = ((paymentsResult.data ?? []) as PaymentWithMember[]).filter((payment) =>
    paymentMatchesSearch(payment, paymentSearch)
  );
  const reports = reportsResult.data ?? [];
  const memberOptions = (membersResult.data ?? []) as MemberOption[];
  const paymentStatusCounts = (paymentStatusRowsResult.data ?? []).reduce<
    Record<PaymentFilter, number>
  >(
    (counts, payment) => {
      const status = payment.status as PaymentStatus;
      counts.all += 1;
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    },
    {
      all: 0,
      failed: 0,
      overdue: 0,
      pending: 0,
      refunded: 0,
      scheduled: 0,
      succeeded: 0
    }
  );
  const todayReport = reports[0] ?? null;
  const todayMetrics = (todayReport?.metrics ?? {}) as Record<string, number>;
  const recoveredAtRisk = recoveryCases.reduce(
    (total, recoveryCase) => total + recoveryCase.amount_cents,
    0
  );
  const criticalCases = recoveryCases.filter(
    (recoveryCase) => recoveryCase.priority === "critical"
  );
  const dueRetryCount = dueAttemptsResult.count ?? 0;
  const openCasesCount = openCasesCountResult.count ?? recoveryCases.length;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Billing recovery"
        title="Failed payments, retries, refunds, and accounting"
        description="Close the billing gap with an operator-grade recovery queue: automatic retry policy, member reminders, Stripe retry attempts, refund tracking, daily reports, and CSV accounting exports."
      />

      {resolvedSearchParams?.message ? (
        <div className="panel border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Open recovery cases"
          value={String(openCasesCount)}
          description="Failed, overdue, missing-card, and past-due cases."
        />
        <MetricCard
          label="Revenue at risk"
          value={formatCurrencyFromCents(recoveredAtRisk)}
          description="Open case balance currently under recovery."
        />
        <MetricCard
          label="Due retries"
          value={String(dueRetryCount)}
          description="Scheduled retry attempts due now."
        />
        <MetricCard
          label="Critical cases"
          value={String(criticalCases.length)}
          description="High-value or urgent billing recovery."
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="space-y-6">
          <form action={syncBillingRecoveryQueueAction} className="panel p-5">
            <p className="section-kicker">Queue sync</p>
            <h2 className="mt-2 text-xl font-semibold">Build recovery queue</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Scan failed payments, overdue payments, past-due subscriptions, and
              members missing cards. Creates or updates recovery cases and scheduled
              retry attempts.
            </p>
            <ServerActionButton
              className="mt-4 w-full"
              idleLabel="Sync billing recovery"
              pendingLabel="Syncing..."
            />
          </form>

          <form action={createPaymentChargeAction} className="panel p-5">
            <p className="section-kicker">Front-desk charge</p>
            <h2 className="mt-2 text-xl font-semibold">Create payment or invoice</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Record a paid walk-up payment, schedule a charge, or create an overdue
              invoice that flows straight into recovery.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium">
                Member
                <select
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="memberId"
                  required
                >
                  <option value="">Choose member</option>
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {getMemberLabel(member)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Amount
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min="0.01"
                    name="amount"
                    placeholder="99.00"
                    step="0.01"
                    type="number"
                    required
                  />
                </label>
                <label className="block text-sm font-medium">
                  Status
                  <select
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="status"
                    defaultValue="scheduled"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="succeeded">Paid now</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Due date
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="dueAt"
                    type="datetime-local"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Invoice number
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="invoiceNumber"
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Description
                <input
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="description"
                  placeholder="Drop-in, class pack, membership adjustment"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Payment type
                  <select
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="paymentType"
                    defaultValue="manual"
                  >
                    <option value="manual">Manual</option>
                    <option value="membership">Membership</option>
                    <option value="drop_in">Drop-in</option>
                    <option value="class_fee">Class fee</option>
                    <option value="pos">POS</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Accounting category
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="accountingCategory"
                    placeholder="membership"
                    defaultValue="manual"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                  Late fee
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min="0"
                    name="lateFee"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Tax
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min="0"
                    name="tax"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Discount
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min="0"
                    name="discount"
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Payment method
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="paymentMethod"
                    placeholder="Cash, card terminal, comp"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Staff note
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="note"
                    placeholder="Optional"
                  />
                </label>
              </div>
            </div>
            <ServerActionButton
              className="mt-4 w-full"
              idleLabel="Create payment row"
              pendingLabel="Creating..."
            />
          </form>

          <form action={updateBillingRetryPolicyAction} className="panel p-5">
            <p className="section-kicker">Retry policy</p>
            <h2 className="mt-2 text-xl font-semibold">Automatic recovery schedule</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Gymdesk-style default is retries at 2, 4, and 7 days after failure.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium">
                Retry offsets in days
                <input
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="retryOffsets"
                  defaultValue={policy.retry_offsets_days.join(",")}
                />
              </label>
              <label className="block text-sm font-medium">
                Reminder offsets in days
                <input
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="reminderOffsets"
                  defaultValue={policy.reminder_offsets_days.join(",")}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Max attempts
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min={1}
                    max={10}
                    name="maxAttempts"
                    type="number"
                    defaultValue={policy.max_attempts}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Final notice after days
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min={1}
                    name="finalNoticeAfterDays"
                    type="number"
                    defaultValue={policy.final_notice_after_days}
                  />
                </label>
              </div>
              <ToggleRow
                checked={policy.auto_retry_enabled}
                description="Allow scheduled Stripe invoice retry attempts."
                label="Auto retry enabled"
                name="autoRetryEnabled"
              />
              <ToggleRow
                checked={policy.member_notifications_enabled}
                description="Send member-facing payment reminders and final notices."
                label="Member notifications"
                name="memberNotificationsEnabled"
              />
              <ToggleRow
                checked={policy.daily_report_enabled}
                description="Maintain daily billing report snapshots."
                label="Daily report"
                name="dailyReportEnabled"
              />
            </div>
            <ServerActionButton
              className="mt-4 w-full"
              idleLabel="Save retry policy"
              pendingLabel="Saving..."
            />
          </form>

          <section className="panel p-5">
            <p className="section-kicker">Accounting export</p>
            <h2 className="mt-2 text-xl font-semibold">CSV-ready payment ledger</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Export paid, failed, overdue, and refunded payments for bookkeeping.
            </p>
            <Link
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-black"
              href="/dashboard/billing-recovery/accounting-export"
            >
              Export accounting CSV
            </Link>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">Recovery cases</h2>
              <p className="mt-1 text-sm text-muted">
                Work the highest-risk cases first. Every action records an attempt.
              </p>
            </div>
            <div className="divide-y divide-border">
              {recoveryCases.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted">
                  No open recovery cases. Sync the queue to scan the latest billing state.
                </div>
              ) : (
                recoveryCases.map((recoveryCase) => {
                  const member = toOneRelation(recoveryCase.members);
                  const payment = recoveryCase.payments;
                  const attempts = recoveryCase.billing_recovery_attempts ?? [];
                  const lastAttempt = attempts.sort((a, b) =>
                    b.created_at.localeCompare(a.created_at)
                  )[0];

                  return (
                    <article className="px-5 py-5" key={recoveryCase.id}>
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="status-pill">
                              {getBillingRecoveryReasonLabel(recoveryCase.reason)}
                            </span>
                            <span className="status-pill">
                              {getBillingRecoveryStatusLabel(recoveryCase.status)}
                            </span>
                            <span className="status-pill">{recoveryCase.priority}</span>
                          </div>
                          <h3 className="mt-3 text-xl font-semibold">
                            {getMemberName(member)}
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {formatCurrencyFromCents(recoveryCase.amount_cents)} at risk
                            {recoveryCase.stripe_invoice_id
                              ? ` - invoice ${recoveryCase.stripe_invoice_id}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            Next retry: {formatDate(recoveryCase.next_retry_at)} | last
                            reminder: {formatDate(recoveryCase.last_reminder_at)}
                          </p>
                          {lastAttempt ? (
                            <p className="mt-2 rounded-xl border border-border bg-black/20 px-3 py-2 text-xs text-muted">
                              Last attempt: {lastAttempt.action.replaceAll("_", " ")} /{" "}
                              {lastAttempt.status} /{" "}
                              {lastAttempt.result_message ?? "No result message"}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <form action={retryRecoveryCaseAction}>
                            <input name="caseId" type="hidden" value={recoveryCase.id} />
                            <ServerActionButton
                              idleLabel="Retry now"
                              pendingLabel="Retrying..."
                              variant="secondary"
                              disabled={!recoveryCase.stripe_invoice_id}
                            />
                          </form>
                          <form action={sendRecoveryReminderAction}>
                            <input name="caseId" type="hidden" value={recoveryCase.id} />
                            <ServerActionButton
                              idleLabel="Send reminder"
                              pendingLabel="Sending..."
                              variant="secondary"
                            />
                          </form>
                          <form action={sendRecoveryReminderAction}>
                            <input name="caseId" type="hidden" value={recoveryCase.id} />
                            <input name="finalNotice" type="hidden" value="true" />
                            <ServerActionButton
                              idleLabel="Final notice"
                              pendingLabel="Sending..."
                              variant="secondary"
                            />
                          </form>
                        </div>
                      </div>
                      <form
                        action={resolveRecoveryCaseAction}
                        className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
                      >
                        <input name="caseId" type="hidden" value={recoveryCase.id} />
                        <input
                          className="rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                          name="note"
                          placeholder="Resolution note"
                        />
                        <ServerActionButton
                          idleLabel="Mark resolved"
                          pendingLabel="Resolving..."
                          variant="ghost"
                        />
                      </form>
                      {payment ? (
                        <p className="mt-3 text-xs text-muted">
                          Payment status: {payment.status}; refunded balance:{" "}
                          {formatCurrencyFromCents(payment.refunded_amount_cents)}
                        </p>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">Payment operations list</h2>
              <p className="mt-1 text-sm text-muted">
                Search invoices, bucket by payment state, edit open rows, apply late
                fees, mark paid, and issue refunds.
              </p>
              <form
                action="/dashboard/billing-recovery"
                className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
              >
                {statusFilter !== "all" ? (
                  <input name="status" type="hidden" value={statusFilter} />
                ) : null}
                <input
                  className="rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="q"
                  placeholder="Search member, email, invoice, Stripe ID, category"
                  defaultValue={resolvedSearchParams?.q ?? ""}
                />
                <button
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
                  type="submit"
                >
                  Search
                </button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                {paymentStatusTabs.map((tab) => {
                  const active = statusFilter === tab.value;
                  return (
                    <Link
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? "border-accent bg-accent text-black"
                          : "border-border bg-black text-white hover:border-accent"
                      }`}
                      href={getStatusLink(tab.value, paymentSearch)}
                      key={tab.value}
                    >
                      {tab.label} ({paymentStatusCounts[tab.value] ?? 0})
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="divide-y divide-border">
              {payments.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted">
                  No payment rows match the current filter.
                </div>
              ) : (
                payments.map((payment) => {
                  const member = toOneRelation(payment.members);
                  const isEditable = editableStatuses.has(payment.status);
                  const refundableRemaining =
                    payment.status === "succeeded"
                      ? payment.amount_cents - payment.refunded_amount_cents
                      : 0;

                  return (
                    <div className="px-5 py-4" key={payment.id}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-medium">
                            {formatCurrencyFromCents(payment.amount_cents)} -{" "}
                            {payment.status}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {getMemberName(member)} | {payment.payment_type} |{" "}
                            {formatDate(payment.paid_at ?? payment.due_at ?? payment.created_at)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Invoice: {payment.invoice_number ?? payment.stripe_invoice_id ?? "None"} |
                            category: {payment.accounting_category}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Late fee {formatCurrencyFromCents(payment.late_fee_cents)} |
                            tax {formatCurrencyFromCents(payment.tax_cents)} | discount{" "}
                            {formatCurrencyFromCents(payment.discount_cents)} | method{" "}
                            {payment.payment_method_label ?? "None"}
                          </p>
                        </div>
                      </div>
                      {isEditable ? (
                        <form
                          action={updatePaymentChargeAction}
                          className="mt-4 grid gap-3 rounded-2xl border border-border bg-black/20 p-3"
                        >
                          <input name="paymentId" type="hidden" value={payment.id} />
                          <div className="grid gap-3 md:grid-cols-4">
                            <label className="block text-xs font-medium text-muted">
                              Amount
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                min="0.01"
                                name="amount"
                                step="0.01"
                                type="number"
                                defaultValue={(payment.amount_cents / 100).toFixed(2)}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Status
                              <select
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="status"
                                defaultValue={payment.status}
                              >
                                <option value="scheduled">Scheduled</option>
                                <option value="pending">Pending</option>
                                <option value="overdue">Overdue</option>
                                <option value="failed">Failed</option>
                                <option value="succeeded">Paid</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Due date
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="dueAt"
                                type="datetime-local"
                                defaultValue={formatDateInput(payment.due_at)}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Invoice
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="invoiceNumber"
                                defaultValue={payment.invoice_number ?? ""}
                              />
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-4">
                            <label className="block text-xs font-medium text-muted">
                              Type
                              <select
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="paymentType"
                                defaultValue={payment.payment_type}
                              >
                                <option value="membership">Membership</option>
                                <option value="drop_in">Drop-in</option>
                                <option value="pos">POS</option>
                                <option value="class_fee">Class fee</option>
                                <option value="manual">Manual</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Category
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="accountingCategory"
                                defaultValue={payment.accounting_category}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Late fee
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                min="0"
                                name="lateFee"
                                step="0.01"
                                type="number"
                                defaultValue={(payment.late_fee_cents / 100).toFixed(2)}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Method
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="paymentMethod"
                                defaultValue={payment.payment_method_label ?? ""}
                              />
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[1fr_0.5fr_0.5fr_auto]">
                            <label className="block text-xs font-medium text-muted">
                              Description
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                name="description"
                                defaultValue={payment.description ?? ""}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Tax
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                min="0"
                                name="tax"
                                step="0.01"
                                type="number"
                                defaultValue={(payment.tax_cents / 100).toFixed(2)}
                              />
                            </label>
                            <label className="block text-xs font-medium text-muted">
                              Discount
                              <input
                                className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                min="0"
                                name="discount"
                                step="0.01"
                                type="number"
                                defaultValue={(payment.discount_cents / 100).toFixed(2)}
                              />
                            </label>
                            <ServerActionButton
                              className="self-end"
                              idleLabel="Save row"
                              pendingLabel="Saving..."
                              variant="secondary"
                            />
                          </div>
                          <label className="block text-xs font-medium text-muted">
                            Staff note
                            <input
                              className="mt-1 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                              name="note"
                              defaultValue={payment.manual_payment_note ?? ""}
                            />
                          </label>
                        </form>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isEditable ? (
                          <>
                            <form action={markPaymentPaidAction}>
                              <input name="paymentId" type="hidden" value={payment.id} />
                              <input name="paymentMethod" type="hidden" value="Manual" />
                              <ServerActionButton
                                idleLabel="Mark paid"
                                pendingLabel="Marking..."
                                variant="ghost"
                              />
                            </form>
                            <form
                              action={applyPaymentLateFeeAction}
                              className="flex flex-wrap gap-2"
                            >
                              <input name="paymentId" type="hidden" value={payment.id} />
                              <input
                                className="w-28 rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                                min="0.01"
                                name="lateFee"
                                placeholder="Fee"
                                step="0.01"
                                type="number"
                              />
                              <ServerActionButton
                                idleLabel="Apply late fee"
                                pendingLabel="Applying..."
                                variant="ghost"
                              />
                            </form>
                          </>
                        ) : null}
                        {refundableRemaining > 0 ? (
                          <form
                            action={issuePaymentRefundAction}
                            className="flex flex-wrap gap-2"
                          >
                            <input name="paymentId" type="hidden" value={payment.id} />
                            <input
                              className="w-32 rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                              max={(refundableRemaining / 100).toFixed(2)}
                              min="0.01"
                              name="amount"
                              placeholder="Refund"
                              step="0.01"
                              type="number"
                            />
                            <input
                              className="w-44 rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                              name="reason"
                              placeholder="Refund reason"
                            />
                            <ServerActionButton
                              idleLabel="Issue refund"
                              pendingLabel="Refunding..."
                              variant="secondary"
                            />
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Daily billing reports</h2>
          <p className="mt-1 text-sm text-muted">
            Snapshot metrics for owner review and future daily email delivery.
          </p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-4">
          <MetricCard
            label="Paid today"
            value={formatCurrencyFromCents(todayMetrics.paid_cents ?? 0)}
            description={`${todayMetrics.paid_count ?? 0} paid rows`}
          />
          <MetricCard
            label="Failed today"
            value={formatCurrencyFromCents(todayMetrics.failed_cents ?? 0)}
            description={`${todayMetrics.failed_count ?? 0} failed rows`}
          />
          <MetricCard
            label="Overdue"
            value={formatCurrencyFromCents(todayMetrics.overdue_cents ?? 0)}
            description={`${todayMetrics.overdue_count ?? 0} overdue rows`}
          />
          <MetricCard
            label="Refunded today"
            value={formatCurrencyFromCents(todayMetrics.refunded_cents ?? 0)}
            description="Refunded amount in latest report"
          />
        </div>
        <div className="divide-y divide-border">
          {reports.map((report) => {
            const metrics = report.metrics as Record<string, number>;
            return (
              <div
                className="flex flex-col gap-2 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between"
                key={report.id}
              >
                <p className="font-medium">{formatDateOnly(report.report_date)}</p>
                <p className="text-muted">
                  Paid {formatCurrencyFromCents(metrics.paid_cents ?? 0)} | failed{" "}
                  {formatCurrencyFromCents(metrics.failed_cents ?? 0)} | open cases{" "}
                  {metrics.open_recovery_cases ?? 0}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function MetricCard({
  label,
  value,
  description
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  name
}: {
  checked: boolean;
  description: string;
  label: string;
  name: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border bg-black/30 p-3 text-sm">
      <input className="mt-1" name={name} type="checkbox" defaultChecked={checked} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-muted">{description}</span>
      </span>
    </label>
  );
}
