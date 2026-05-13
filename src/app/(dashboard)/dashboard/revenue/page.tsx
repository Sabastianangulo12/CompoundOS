import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { PlanForm } from "@/components/revenue/plan-form";
import {
  archivePlanAction,
  archiveSubscriptionAction,
  createPaymentAction,
  createPlanAction,
  createSubscriptionAction,
  startStripeCheckoutAction,
  startStripeConnectOnboardingAction
} from "@/app/(dashboard)/dashboard/revenue/actions";
import { hasStripeServerEnv } from "@/lib/env";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  formatCurrencyFromCents,
  getRevenueSnapshot,
  paymentStatuses,
  subscriptionStatuses,
  type PaymentWithRelations,
  type SubscriptionWithRelations
} from "@/lib/revenue";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RevenuePageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
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

  const [
    revenueSnapshot,
    gymResult,
    plansResult,
    membersResult,
    subscriptionsResult,
    paymentsResult
  ] = await Promise.all([
    getRevenueSnapshot(supabase, currentGym.data.membership.gymId),
    supabase
      .from("gyms")
      .select(
        "id, name, stripe_connected_account_id, stripe_onboarding_completed, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted"
      )
      .eq("id", currentGym.data.membership.gymId)
      .single(),
    supabase
      .from("membership_plans")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: false
      }),
    supabase
      .from("members")
      .select("id, first_name, last_name, email, status")
      .eq("gym_id", currentGym.data.membership.gymId)
      .neq("status", "canceled")
      .order("first_name", {
        ascending: true
      }),
    supabase
      .from("subscriptions")
      .select(
        `
          *,
          members (
            id,
            first_name,
            last_name,
            email
          ),
          membership_plans (
            id,
            name,
            price_cents,
            billing_interval
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: false
      }),
    supabase
      .from("payments")
      .select(
        `
          *,
          members (
            id,
            first_name,
            last_name
          ),
          subscriptions (
            id,
            status
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: false
      })
      .limit(20)
  ]);

  if (revenueSnapshot.error) {
    throw new Error(revenueSnapshot.error.message);
  }

  if (plansResult.error) {
    throw new Error(plansResult.error.message);
  }

  if (gymResult.error) {
    throw new Error(gymResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  if (subscriptionsResult.error) {
    throw new Error(subscriptionsResult.error.message);
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  const plans = plansResult.data ?? [];
  const activePlans = plans.filter((plan) => plan.is_active);
  const archivedPlans = plans.filter((plan) => !plan.is_active);
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionWithRelations[];
  const payments = (paymentsResult.data ?? []) as PaymentWithRelations[];
  const gym = gymResult.data;
  const stripeConfigured = hasStripeServerEnv();
  const stripeReadyForCheckout =
    stripeConfigured &&
    Boolean(gym.stripe_connected_account_id) &&
    gym.stripe_charges_enabled;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Revenue"
        title="Revenue engine v1"
        description={`Plans, subscriptions, and payment tracking for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Estimated monthly recurring revenue"
          value={formatCurrencyFromCents(
            revenueSnapshot.estimatedMonthlyRecurringRevenue
          )}
          description="Projected from active and trialing subscriptions."
        />
        <PlaceholderCard
          title="Active subscriptions"
          value={String(revenueSnapshot.activeSubscriptions)}
          description="Members currently on an active plan."
        />
        <PlaceholderCard
          title="Past due subscriptions"
          value={String(revenueSnapshot.pastDueSubscriptions)}
          description="Subscriptions needing recovery follow-up."
        />
        <PlaceholderCard
          title="Failed payments"
          value={String(revenueSnapshot.failedPayments)}
          description="Recorded payment failures in this gym."
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Stripe Connect</h2>
          <p className="mt-1 text-sm text-muted">
            Each gym connects its own Stripe account so subscription revenue stays tenant-scoped.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-4">
          <PlaceholderCard
            title="Connected account"
            value={gym.stripe_connected_account_id ? "Connected" : "Not connected"}
            description={
              gym.stripe_connected_account_id ?? "Create the gym's Stripe account."
            }
          />
          <PlaceholderCard
            title="Onboarding"
            value={gym.stripe_onboarding_completed ? "Submitted" : "Pending"}
            description="Stripe-hosted onboarding status for this gym."
          />
          <PlaceholderCard
            title="Charges"
            value={gym.stripe_charges_enabled ? "Enabled" : "Not ready"}
            description="Required before member checkout can begin."
          />
          <PlaceholderCard
            title="Payouts"
            value={gym.stripe_payouts_enabled ? "Enabled" : "Not ready"}
            description="Shows whether Stripe can pay out this connected gym."
          />
        </div>
        <div className="border-t border-border px-6 py-4">
          {stripeConfigured ? (
            <form action={startStripeConnectOnboardingAction}>
              <button
                className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
                type="submit"
              >
                {gym.stripe_connected_account_id ? "Resume Stripe onboarding" : "Connect Stripe"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_APP_URL`
              to enable billing.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-6">
          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Membership plans</h2>
              <p className="mt-1 text-sm text-muted">
                Create clean pricing offers without exposing gym tenancy in the UI.
              </p>
            </div>
            <div className="p-6">
              <PlanForm
                action={createPlanAction}
                submitLabel="Create plan"
                pendingLabel="Creating..."
              />
            </div>
            <div className="divide-y divide-border">
              {activePlans.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No active plans yet.
                </div>
              ) : (
                activePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="font-medium">{plan.name}</p>
                      <p className="mt-1 text-sm text-muted">
                        {formatCurrencyFromCents(plan.price_cents)} per {plan.billing_interval}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        className="text-sm font-medium text-foreground"
                        href={`/dashboard/revenue/plans/${plan.id}/edit`}
                      >
                        Edit
                      </Link>
                      <form action={archivePlanAction}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button
                          className="text-sm text-muted hover:text-foreground"
                          type="submit"
                        >
                          Archive
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
            {archivedPlans.length > 0 ? (
              <div className="border-t border-border px-6 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">
                  Archived plans
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {archivedPlans.map((plan) => (
                    <span
                      key={plan.id}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted"
                    >
                      {plan.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Subscriptions</h2>
              <p className="mt-1 text-sm text-muted">
                Assign plans to members and track subscription health.
              </p>
            </div>
            <div className="p-6">
              <form action={createSubscriptionAction} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="memberId">
                    Member
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="memberId"
                    name="memberId"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select member
                    </option>
                    {membersResult.data?.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm text-muted"
                    htmlFor="membershipPlanId"
                  >
                    Plan
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="membershipPlanId"
                    name="membershipPlanId"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select plan
                    </option>
                    {activePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {formatCurrencyFromCents(plan.price_cents)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="status">
                    Status
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="status"
                    name="status"
                    defaultValue="active"
                  >
                    {subscriptionStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm text-muted"
                    htmlFor="currentPeriodStart"
                  >
                    Period start
                  </label>
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="currentPeriodStart"
                    name="currentPeriodStart"
                    type="date"
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm text-muted"
                    htmlFor="currentPeriodEnd"
                  >
                    Period end
                  </label>
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="currentPeriodEnd"
                    name="currentPeriodEnd"
                    type="date"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
                    type="submit"
                  >
                    Assign plan
                  </button>
                </div>
              </form>
            </div>
            <div className="border-t border-border px-6 py-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                Stripe checkout
              </h3>
              <p className="mt-2 text-sm text-muted">
                Open a hosted Stripe subscription checkout for a member and sync the result
                back through webhooks.
              </p>
              <form action={startStripeCheckoutAction} className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="stripeMemberId">
                    Member
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="stripeMemberId"
                    name="memberId"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select member
                    </option>
                    {membersResult.data?.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="stripePlanId">
                    Plan
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="stripePlanId"
                    name="membershipPlanId"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select plan
                    </option>
                    {activePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {formatCurrencyFromCents(plan.price_cents)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={!stripeReadyForCheckout || activePlans.length === 0}
                  >
                    Open Stripe checkout
                  </button>
                  {!stripeReadyForCheckout ? (
                    <p className="mt-2 text-sm text-muted">
                      Finish Stripe onboarding and enable charges before using hosted checkout.
                    </p>
                  ) : null}
                </div>
              </form>
            </div>
            <div className="divide-y divide-border">
              {subscriptions.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No subscriptions recorded yet.
                </div>
              ) : (
                subscriptions.map((subscription) => (
                  <div
                    key={subscription.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {subscription.members?.first_name} {subscription.members?.last_name}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {[subscription.membership_plans?.name ?? "No plan", subscription.status.replace("_", " ")].join(" - ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        className="text-sm font-medium text-foreground"
                        href={`/dashboard/members/${subscription.member_id}/edit`}
                      >
                        Open member
                      </Link>
                      {subscription.status !== "canceled" ? (
                        <form action={archiveSubscriptionAction}>
                          <input
                            type="hidden"
                            name="subscriptionId"
                            value={subscription.id}
                          />
                          <button
                            className="text-sm text-muted hover:text-foreground"
                            type="submit"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="space-y-6">
          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Payments</h2>
              <p className="mt-1 text-sm text-muted">
                Manual entries plus Stripe webhook sync for live billing activity.
              </p>
            </div>
            <div className="p-6">
              <form action={createPaymentAction} className="grid gap-4">
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="amount">
                    Amount
                  </label>
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="amount"
                    name="amount"
                    placeholder="149.00"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="paymentStatus">
                    Status
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="paymentStatus"
                    name="status"
                    defaultValue="succeeded"
                  >
                    {paymentStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="paymentMemberId">
                    Member
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="paymentMemberId"
                    name="memberId"
                    defaultValue=""
                  >
                    <option value="">Optional member</option>
                    {membersResult.data?.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm text-muted"
                    htmlFor="paymentSubscriptionId"
                  >
                    Subscription
                  </label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="paymentSubscriptionId"
                    name="subscriptionId"
                    defaultValue=""
                  >
                    <option value="">Optional subscription</option>
                    {subscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.members?.first_name} {subscription.members?.last_name} -{" "}
                        {subscription.membership_plans?.name ?? "No plan"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-muted" htmlFor="paidAt">
                    Paid at
                  </label>
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    id="paidAt"
                    name="paidAt"
                    type="date"
                  />
                </div>
                <div>
                  <button
                    className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
                    type="submit"
                  >
                    Record payment
                  </button>
                </div>
              </form>
            </div>
            <div className="divide-y divide-border">
              {payments.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No payments recorded yet.
                </div>
              ) : (
                payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {formatCurrencyFromCents(payment.amount_cents)}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {payment.members
                          ? `${payment.members.first_name} ${payment.members.last_name}`
                          : "No member linked"}
                      </p>
                    </div>
                    <div className="text-sm text-muted sm:text-right">
                      <p className="capitalize">{payment.status}</p>
                      <p className="mt-1">
                        {payment.paid_at
                          ? new Date(payment.paid_at).toLocaleDateString("en-US")
                          : "No paid date"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}
