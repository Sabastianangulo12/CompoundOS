import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { PlanForm } from "@/components/revenue/plan-form";
import {
  cancelMemberMembershipAction,
  createMemberFollowUpTaskAction,
  freezeMemberMembershipAction,
  resumeMemberMembershipAction
} from "@/app/(dashboard)/dashboard/members/actions";
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
import { getStripe } from "@/lib/stripe/server";
import { updateGymStripeState } from "@/lib/stripe-sync";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RevenuePageProps = {
  searchParams?: Promise<{
    message?: string;
    rosterPage?: string;
    subscriptionsPage?: string;
    paymentsPage?: string;
  }>;
};

type BillingRosterMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_default_payment_method_id: string | null;
  frozen_until: string | null;
};

function formatMemberStatus(status: string) {
  return status.replace("_", " ");
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const resolvedSearchParams = await searchParams;
  const rosterPage = Math.max(1, Number(resolvedSearchParams?.rosterPage ?? "1") || 1);
  const subscriptionsPage =
    Math.max(1, Number(resolvedSearchParams?.subscriptionsPage ?? "1") || 1);
  const paymentsPage = Math.max(1, Number(resolvedSearchParams?.paymentsPage ?? "1") || 1);
  const rosterPageSize = 14;
  const subscriptionsPageSize = 12;
  const paymentsPageSize = 12;
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);
  const stripeConfigured = hasStripeServerEnv();

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
    paymentsResult,
    followUpTasksResult
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
      .select(
        "id, first_name, last_name, email, status, stripe_customer_id, stripe_default_payment_method_id, frozen_until"
      )
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
      .limit(20),
    supabase
      .from("member_follow_up_tasks")
      .select(
        `
          id,
          title,
          details,
          task_type,
          priority,
          status,
          due_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
      .in("task_type", ["billing", "general"])
      .order("priority", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(10)
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
  if (followUpTasksResult.error) {
    throw new Error(followUpTasksResult.error.message);
  }

  const plans = plansResult.data ?? [];
  const activePlans = plans.filter((plan) => plan.is_active);
  const archivedPlans = plans.filter((plan) => !plan.is_active);
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionWithRelations[];
  const payments = (paymentsResult.data ?? []) as PaymentWithRelations[];
  const members = (membersResult.data ?? []) as BillingRosterMember[];
  const followUpTasks = (followUpTasksResult.data ?? []) as Array<{
    id: string;
    title: string;
    details: string | null;
    task_type: string;
    priority: string;
    status: string;
    due_at: string | null;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  let gym = gymResult.data;
  let stripeCurrentlyDue: string[] = [];

  if (stripeConfigured && gym.stripe_connected_account_id) {
    try {
      const account = await Promise.race([
        getStripe().accounts.retrieve(gym.stripe_connected_account_id),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 1200);
        })
      ]);

      if (account && !("deleted" in account)) {
        stripeCurrentlyDue = account.requirements?.currently_due ?? [];

        await updateGymStripeState(supabase, gym.id, account);

        gym = {
          ...gym,
          stripe_connected_account_id: account.id,
          stripe_onboarding_completed: Boolean(account.details_submitted),
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
          stripe_details_submitted: Boolean(account.details_submitted)
        };
      }
    } catch {
      // Keep the last known database state if Stripe live sync fails on page load.
    }
  }

  const stripeReadyForCheckout =
    stripeConfigured &&
    Boolean(gym.stripe_connected_account_id) &&
    gym.stripe_charges_enabled;
  const stripeNeedsPlatformConnect =
    stripeConfigured &&
    !gym.stripe_connected_account_id &&
    !gym.stripe_onboarding_completed &&
    !gym.stripe_charges_enabled;
  const stripeNeedsGymOnboarding =
    stripeConfigured &&
    Boolean(gym.stripe_connected_account_id) &&
    (!gym.stripe_onboarding_completed || !gym.stripe_charges_enabled);
  const latestSubscriptionByMember = new Map<string, SubscriptionWithRelations>();

  subscriptions.forEach((subscription) => {
    if (!latestSubscriptionByMember.has(subscription.member_id)) {
      latestSubscriptionByMember.set(subscription.member_id, subscription);
    }
  });

  const billingRoster = members.map((member) => {
    const subscription = latestSubscriptionByMember.get(member.id) ?? null;
    const hasCardOnFile = Boolean(
      member.stripe_default_payment_method_id || member.stripe_customer_id
    );
    const needsPlan = !subscription || subscription.status === "canceled";
    const isPastDue = subscription?.status === "past_due";
    const isFrozen = member.status === "frozen";

    return {
      member,
      subscription,
      hasCardOnFile,
      needsPlan,
      isPastDue,
      isFrozen
    };
  });

  const membersMissingPlan = billingRoster.filter((entry) => entry.needsPlan);
  const membersMissingCard = billingRoster.filter(
    (entry) => !entry.hasCardOnFile && !entry.needsPlan
  );
  const frozenMembers = billingRoster.filter((entry) => entry.isFrozen);
  const pastDueMembers = billingRoster.filter((entry) => entry.isPastDue);
  const rosterTotalPages = Math.max(1, Math.ceil(billingRoster.length / rosterPageSize));
  const subscriptionsTotalPages = Math.max(
    1,
    Math.ceil(subscriptions.length / subscriptionsPageSize)
  );
  const paymentsTotalPages = Math.max(1, Math.ceil(payments.length / paymentsPageSize));
  const currentRosterPage = Math.min(rosterPage, rosterTotalPages);
  const currentSubscriptionsPage = Math.min(subscriptionsPage, subscriptionsTotalPages);
  const currentPaymentsPage = Math.min(paymentsPage, paymentsTotalPages);
  const paginatedBillingRoster = billingRoster.slice(
    (currentRosterPage - 1) * rosterPageSize,
    currentRosterPage * rosterPageSize
  );
  const paginatedSubscriptions = subscriptions.slice(
    (currentSubscriptionsPage - 1) * subscriptionsPageSize,
    currentSubscriptionsPage * subscriptionsPageSize
  );
  const paginatedPayments = payments.slice(
    (currentPaymentsPage - 1) * paymentsPageSize,
    currentPaymentsPage * paymentsPageSize
  );
  const memberSelectOptions = members.slice(0, 50);
  const subscriptionSelectOptions = subscriptions.slice(0, 50);
  const revenueHref = (
    nextRosterPage = currentRosterPage,
    nextSubscriptionsPage = currentSubscriptionsPage,
    nextPaymentsPage = currentPaymentsPage
  ) => {
    const params = new URLSearchParams();
    if (resolvedSearchParams?.message) {
      params.set("message", resolvedSearchParams.message);
    }
    params.set("rosterPage", String(nextRosterPage));
    params.set("subscriptionsPage", String(nextSubscriptionsPage));
    params.set("paymentsPage", String(nextPaymentsPage));
    return `/dashboard/revenue?${params.toString()}`;
  };

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

      {stripeNeedsPlatformConnect ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          Stripe server keys are connected, but your Stripe platform still needs Connect enabled.
          Open <span className="font-medium">dashboard.stripe.com/connect</span>, finish Stripe
          Connect setup there, then come back here and click <span className="font-medium">Connect Stripe</span>.
        </div>
      ) : null}

      {stripeNeedsGymOnboarding ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 text-sm text-foreground">
          Stripe is partially connected for this gym, but onboarding is not finished yet. Resume
          onboarding below until charges are enabled.
          {stripeCurrentlyDue.length > 0 ? (
            <span className="mt-2 block text-xs text-muted">
              Still required by Stripe: {stripeCurrentlyDue.join(", ")}.
            </span>
          ) : null}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Missing plan"
          value={String(membersMissingPlan.length)}
          description="Members who still need a subscription assigned."
        />
        <PlaceholderCard
          title="Missing card"
          value={String(membersMissingCard.length)}
          description="Members with a plan but no saved billing identity."
        />
        <PlaceholderCard
          title="Frozen members"
          value={String(frozenMembers.length)}
          description="Members currently in the 4-week freeze window."
        />
        <PlaceholderCard
          title="Past due members"
          value={String(pastDueMembers.length)}
          description="Members whose subscription needs recovery."
        />
        <PlaceholderCard
          title="Billing follow-ups"
          value={String(followUpTasks.length)}
          description="Open operator tasks tied to billing recovery."
        />
      </div>

      <section className="panel-hero overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Billing operations queue</h2>
          <p className="mt-1 text-sm text-muted">
            The members who need plan assignment, payment setup, renewal, or billing recovery first.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 xl:grid-cols-3">
          <div className="panel-soft p-4">
            <p className="section-kicker text-muted">Needs plan</p>
            <div className="mt-4 space-y-3">
              {membersMissingPlan.length === 0 ? (
                <p className="text-sm text-muted">Everyone has a plan assigned.</p>
              ) : (
                membersMissingPlan.slice(0, 3).map((entry) => (
                  <div key={entry.member.id} className="panel-soft px-4 py-4">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.member.first_name} {entry.member.last_name}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        No active subscription on file
                      </p>
                    </div>
                    {activePlans.length > 0 ? (
                      <form action={createSubscriptionAction} className="mt-3 space-y-3">
                        <input type="hidden" name="memberId" value={entry.member.id} />
                        <input type="hidden" name="status" value="active" />
                        <div className="space-y-2">
                          <label
                            className="block text-[11px] uppercase tracking-[0.18em] text-muted"
                            htmlFor={`queue-plan-${entry.member.id}`}
                          >
                            Assign plan now
                          </label>
                          <select
                            className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm outline-none"
                            id={`queue-plan-${entry.member.id}`}
                            name="membershipPlanId"
                            defaultValue={activePlans[0]?.id ?? ""}
                            required
                          >
                            {activePlans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name} - {formatCurrencyFromCents(plan.price_cents)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <ServerActionButton
                          idleLabel="Assign active plan"
                          pendingLabel="Assigning..."
                          className="w-full"
                        />
                      </form>
                    ) : (
                      <p className="mt-3 text-xs text-muted">
                        Create an active membership plan first before assigning one here.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <Link className="action-link text-xs" href={`/dashboard/members/${entry.member.id}/edit`}>
                        Open
                      </Link>
                      <MemberQuickNotifyForm
                        memberId={entry.member.id}
                        redirectTo="/dashboard/revenue"
                        title="We need to assign your membership plan"
                        body={`Hi ${entry.member.first_name}, we are finalizing your membership setup and still need to assign your plan. We will help you get that completed.`}
                        type="billing"
                        label="Notify"
                        className="text-muted hover:text-foreground"
                      />
                      <form action={createMemberFollowUpTaskAction}>
                        <input type="hidden" name="memberId" value={entry.member.id} />
                        <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                        <input type="hidden" name="title" value="Assign membership plan" />
                        <input
                          type="hidden"
                          name="details"
                          value="Member is active in the billing queue but still has no assigned membership plan."
                        />
                        <input type="hidden" name="taskType" value="billing" />
                        <input type="hidden" name="priority" value="medium" />
                        <ServerActionButton
                          idleLabel="Follow up"
                          pendingLabel="Creating..."
                          variant="ghost"
                          className="px-0 py-0"
                        />
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="panel-soft p-4">
            <p className="section-kicker text-muted">Needs card</p>
            <div className="mt-4 space-y-3">
              {membersMissingCard.length === 0 ? (
                <p className="text-sm text-muted">No immediate card setup issues.</p>
              ) : (
                membersMissingCard.slice(0, 3).map((entry) => (
                  <div key={entry.member.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.member.first_name} {entry.member.last_name}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Plan assigned but no card or Stripe customer saved
                      </p>
                    </div>
                    <Link className="action-link text-xs" href={`/dashboard/members/${entry.member.id}/edit`}>
                      Open
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={entry.member.id}
                      redirectTo="/dashboard/revenue"
                      title="Please add your payment method"
                      body={`Hi ${entry.member.first_name}, your membership is active but we still need a saved payment method on file. Please update it when you can.`}
                      type="billing"
                      label="Notify"
                      className="text-xs text-muted hover:text-foreground"
                    />
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                      <input type="hidden" name="title" value="Collect payment method" />
                      <input
                        type="hidden"
                        name="details"
                        value="Member has a subscription but no saved card or Stripe billing identity."
                      />
                      <input type="hidden" name="taskType" value="billing" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Follow up"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-xs"
                      />
                    </form>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="panel-soft p-4">
            <p className="section-kicker text-muted">Recovery</p>
            <div className="mt-4 space-y-3">
              {[...pastDueMembers, ...frozenMembers]
                .slice(0, 3)
                .map((entry) => (
                  <div key={entry.member.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.member.first_name} {entry.member.last_name}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {entry.isPastDue
                          ? "Past due subscription"
                          : `Frozen until ${entry.member.frozen_until ?? "not set"}`}
                      </p>
                    </div>
                    <Link className="action-link text-xs" href={`/dashboard/members/${entry.member.id}/edit`}>
                      Open
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={entry.member.id}
                      redirectTo="/dashboard/revenue"
                      title={entry.isPastDue ? "Your membership payment needs attention" : "Your frozen membership needs action soon"}
                      body={
                        entry.isPastDue
                          ? `Hi ${entry.member.first_name}, your membership payment is currently past due. Please update it so your account stays active.`
                          : `Hi ${entry.member.first_name}, your membership is currently frozen${entry.member.frozen_until ? ` until ${entry.member.frozen_until}` : ""}. Resume soon to avoid cancellation.`
                      }
                      type="billing"
                      label="Notify"
                      className="text-xs text-muted hover:text-foreground"
                    />
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                      <input
                        type="hidden"
                        name="title"
                        value={entry.isPastDue ? "Resolve past due billing" : "Review frozen membership"}
                      />
                      <input
                        type="hidden"
                        name="details"
                        value={
                          entry.isPastDue
                            ? "Member subscription is past due and needs recovery follow-up."
                            : `Member is frozen${entry.member.frozen_until ? ` until ${entry.member.frozen_until}` : ""}.`
                        }
                      />
                      <input type="hidden" name="taskType" value="billing" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Follow up"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-xs"
                      />
                    </form>
                  </div>
                ))}
              {pastDueMembers.length === 0 && frozenMembers.length === 0 ? (
                <p className="text-sm text-muted">No recovery queue right now.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Billing follow-up tasks</h2>
          <p className="mt-1 text-sm text-muted">
            Open work for recovery, card collection, and subscription cleanup.
          </p>
        </div>
        <div className="divide-y divide-border">
          {followUpTasks.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No billing follow-ups open right now.
            </div>
          ) : (
            followUpTasks.map((task) => {
              const member = toOneRelation(task.members);
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{task.title}</p>
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {task.task_type.replace("_", " ")}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {task.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {member
                        ? `${member.first_name} ${member.last_name}`
                        : "No member linked"}
                      {task.details ? ` | ${task.details}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-muted lg:text-right">
                    <p>
                      {task.due_at
                        ? `Due ${new Date(task.due_at).toLocaleDateString("en-US")}`
                        : "No due date"}
                    </p>
                    {member ? (
                      <Link
                        className="mt-1 block font-medium text-foreground"
                        href={`/dashboard/members/${member.id}/edit`}
                      >
                        Open member
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

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
              <ServerActionButton
                idleLabel={
                  gym.stripe_connected_account_id
                    ? "Resume Stripe onboarding"
                    : "Connect Stripe"
                }
                pendingLabel="Opening Stripe..."
              />
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
                        <ServerActionButton
                          idleLabel="Archive"
                          pendingLabel="Archiving..."
                          variant="ghost"
                          className="px-0 py-0 text-sm"
                        />
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
                <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted md:col-span-2">
                  Assign or overwrite the current subscription for a member. Leave period dates empty if you want staff to manage dates later.
                </div>
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
                    {memberSelectOptions.map((member) => (
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
                  <ServerActionButton
                    idleLabel="Assign plan"
                    pendingLabel="Saving subscription..."
                  />
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
                    {memberSelectOptions.map((member) => (
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
                  <ServerActionButton
                    idleLabel="Open Stripe checkout"
                    pendingLabel="Opening checkout..."
                    disabled={!stripeReadyForCheckout || activePlans.length === 0}
                    className="bg-white text-black"
                  />
                  {!stripeReadyForCheckout ? (
                    <p className="mt-2 text-sm text-muted">
                      {stripeNeedsPlatformConnect
                        ? "Enable Stripe Connect on your Stripe platform first, then reconnect this gym."
                        : "Finish Stripe onboarding and enable charges before using hosted checkout."}
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
                paginatedSubscriptions.map((subscription) => (
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
                          <ServerActionButton
                            idleLabel="Archive"
                            pendingLabel="Archiving..."
                            variant="ghost"
                            className="px-0 py-0 text-sm"
                          />
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            {subscriptions.length > subscriptionsPageSize ? (
              <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm text-muted">
                <p>
                  Subscriptions page {currentSubscriptionsPage} of {subscriptionsTotalPages}
                </p>
                <div className="flex items-center gap-3">
                  {currentSubscriptionsPage > 1 ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage,
                        currentSubscriptionsPage - 1,
                        currentPaymentsPage
                      )}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="opacity-50">Previous</span>
                  )}
                  {currentSubscriptionsPage < subscriptionsTotalPages ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage,
                        currentSubscriptionsPage + 1,
                        currentPaymentsPage
                      )}
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="opacity-50">Next</span>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Member billing roster</h2>
              <p className="mt-1 text-sm text-muted">
                A single operator view of plan assignment, billing identity, and lifecycle actions.
              </p>
            </div>
            <div className="divide-y divide-border">
              {billingRoster.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No members available yet.
                </div>
              ) : (
                paginatedBillingRoster.map((entry) => (
                  <div
                    key={entry.member.id}
                    className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-center xl:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {entry.member.first_name} {entry.member.last_name}
                      </p>
                      <p className="text-sm text-muted">
                        {entry.subscription?.membership_plans?.name ?? "No plan assigned"} |{" "}
                        {entry.subscription
                          ? formatMemberStatus(entry.subscription.status)
                          : formatMemberStatus(entry.member.status)}
                      </p>
                      <p className="text-xs text-muted">
                        {entry.hasCardOnFile
                          ? "Card or Stripe customer on file"
                          : "No card or Stripe customer on file"}
                        {entry.member.frozen_until
                          ? ` | Frozen until ${entry.member.frozen_until}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        className="text-sm font-medium text-foreground"
                        href={`/dashboard/members/${entry.member.id}/edit`}
                      >
                        Open member
                      </Link>
                      <form action={freezeMemberMembershipAction}>
                        <input type="hidden" name="memberId" value={entry.member.id} />
                        <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                        <ServerActionButton
                          idleLabel="Freeze"
                          pendingLabel="Freezing..."
                          variant="ghost"
                          className="px-0 py-0"
                        />
                      </form>
                      <form action={resumeMemberMembershipAction}>
                        <input type="hidden" name="memberId" value={entry.member.id} />
                        <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                        <ServerActionButton
                          idleLabel="Renew"
                          pendingLabel="Renewing..."
                          variant="ghost"
                          className="px-0 py-0"
                        />
                      </form>
                      <form action={cancelMemberMembershipAction}>
                        <input type="hidden" name="memberId" value={entry.member.id} />
                        <input type="hidden" name="redirectTo" value="/dashboard/revenue" />
                        <ServerActionButton
                          idleLabel="Cancel"
                          pendingLabel="Canceling..."
                          variant="ghost"
                          className="px-0 py-0"
                        />
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
            {billingRoster.length > rosterPageSize ? (
              <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm text-muted">
                <p>
                  Billing roster page {currentRosterPage} of {rosterTotalPages}
                </p>
                <div className="flex items-center gap-3">
                  {currentRosterPage > 1 ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage - 1,
                        currentSubscriptionsPage,
                        currentPaymentsPage
                      )}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="opacity-50">Previous</span>
                  )}
                  {currentRosterPage < rosterTotalPages ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage + 1,
                        currentSubscriptionsPage,
                        currentPaymentsPage
                      )}
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="opacity-50">Next</span>
                  )}
                </div>
              </div>
            ) : null}
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
                    {memberSelectOptions.map((member) => (
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
                    {subscriptionSelectOptions.map((subscription) => (
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
                  <ServerActionButton
                    idleLabel="Record payment"
                    pendingLabel="Recording..."
                  />
                </div>
              </form>
            </div>
            <div className="divide-y divide-border">
              {payments.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No payments recorded yet.
                </div>
              ) : (
                paginatedPayments.map((payment) => (
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
            {payments.length > paymentsPageSize ? (
              <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm text-muted">
                <p>
                  Payments page {currentPaymentsPage} of {paymentsTotalPages}
                </p>
                <div className="flex items-center gap-3">
                  {currentPaymentsPage > 1 ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage,
                        currentSubscriptionsPage,
                        currentPaymentsPage - 1
                      )}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="opacity-50">Previous</span>
                  )}
                  {currentPaymentsPage < paymentsTotalPages ? (
                    <Link
                      className="text-foreground"
                      href={revenueHref(
                        currentRosterPage,
                        currentSubscriptionsPage,
                        currentPaymentsPage + 1
                      )}
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="opacity-50">Next</span>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </section>
  );
}
