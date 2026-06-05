import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  completeMemberFollowUpTaskAction,
  createMemberFollowUpTaskAction,
  resumeMemberMembershipAction
} from "@/app/(dashboard)/dashboard/members/actions";
import { getRecentCheckInsForGym } from "@/lib/check-ins";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RetentionPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

type MemberLite = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  frozen_until: string | null;
  stripe_default_payment_method_id: string | null;
};

type SubscriptionLite = {
  id: string;
  member_id: string;
  status: string;
  current_period_end: string | null;
  membership_plans: Array<{ name: string }> | null;
};

type FollowUpTaskLite = {
  id: string;
  title: string;
  task_type: string;
  priority: string;
  status: string;
  due_at: string | null;
  members: Array<{
    id: string;
    first_name: string;
    last_name: string;
  }> | null;
};

export default async function RetentionPage({ searchParams }: RetentionPageProps) {
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

  const [
    membersResult,
    recentCheckInsResult,
    subscriptionsResult,
    failedPaymentsResult,
    eventsResult,
    followUpTasksResult,
    insightsResult
  ] = await Promise.all([
    supabase
      .from("members")
      .select(
        "id, first_name, last_name, status, frozen_until, stripe_default_payment_method_id"
      )
      .eq("gym_id", gymId)
      .neq("status", "canceled")
      .order("first_name", { ascending: true }),
    getRecentCheckInsForGym(supabase, gymId, 500),
    supabase
      .from("subscriptions")
      .select(
        `
          id,
          member_id,
          status,
          current_period_end,
          membership_plans (
            name
          )
        `
      )
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select(
        `
          id,
          amount_cents,
          created_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", gymId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("member_membership_events")
      .select(
        `
          id,
          event_type,
          frozen_until,
          created_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("member_follow_up_tasks")
      .select(
        `
          id,
          title,
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
      .eq("gym_id", gymId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from("ai_insights")
      .select(
        `
          id,
          type,
          priority,
          title,
          member_id,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", gymId)
      .eq("status", "open")
      .in("type", ["retention_risk", "inactivity", "attendance_drop", "failed_payment"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (recentCheckInsResult.error) throw new Error(recentCheckInsResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (failedPaymentsResult.error) throw new Error(failedPaymentsResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (followUpTasksResult.error) throw new Error(followUpTasksResult.error.message);
  if (insightsResult.error) throw new Error(insightsResult.error.message);

  const members = (membersResult.data ?? []) as MemberLite[];
  const recentCheckIns = recentCheckInsResult.data ?? [];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionLite[];
  const failedPayments = (failedPaymentsResult.data ?? []) as Array<{
    id: string;
    amount_cents: number;
    created_at: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  const membershipEvents = (eventsResult.data ?? []) as Array<{
    id: string;
    event_type: string;
    frozen_until: string | null;
    created_at: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  const followUpTasks = (followUpTasksResult.data ?? []) as FollowUpTaskLite[];
  const insights = (insightsResult.data ?? []) as Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    member_id: string | null;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;

  const latestSubscriptionByMember = new Map<string, SubscriptionLite>();
  for (const subscription of subscriptions) {
    if (!latestSubscriptionByMember.has(subscription.member_id)) {
      latestSubscriptionByMember.set(subscription.member_id, subscription);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const noVisitMembers = members
    .map((member) => {
      const lastCheckIn = recentCheckIns.find((checkIn) => checkIn.member_id === member.id) ?? null;
      const daysSinceLastVisit = lastCheckIn
        ? Math.floor((Date.now() - new Date(lastCheckIn.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        member,
        lastCheckIn,
        daysSinceLastVisit
      };
    })
    .filter((entry) => (entry.daysSinceLastVisit ?? 999) >= 14)
    .sort((left, right) => (right.daysSinceLastVisit ?? 999) - (left.daysSinceLastVisit ?? 999));

  const upcomingFreezeExpirations = members
    .filter((member) => member.status === "frozen" && member.frozen_until)
    .map((member) => {
      const frozenUntil = new Date(`${member.frozen_until}T00:00:00.000Z`);
      const daysRemaining = Math.ceil(
        (frozenUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        member,
        daysRemaining
      };
    })
    .filter((entry) => entry.daysRemaining <= 7)
    .sort((left, right) => left.daysRemaining - right.daysRemaining);

  const pastDueMembers = members
    .map((member) => ({
      member,
      subscription: latestSubscriptionByMember.get(member.id) ?? null
    }))
    .filter((entry) => entry.subscription?.status === "past_due");

  const membersMissingCard = members
    .map((member) => ({
      member,
      subscription: latestSubscriptionByMember.get(member.id) ?? null
    }))
    .filter(
      (entry) =>
        Boolean(entry.subscription) &&
        entry.subscription?.status !== "canceled" &&
        !entry.member.stripe_default_payment_method_id
    );

  function getPlanName(subscription: SubscriptionLite | null) {
    return toOneRelation(subscription?.membership_plans)?.name ?? null;
  }

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Retention"
        title="Retention workspace"
        description={`Monitor churn risk, recovery queues, and member follow-up for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="No-visit members"
          value={String(noVisitMembers.length)}
          description="Members who have not checked in for at least 14 days."
        />
        <PlaceholderCard
          title="Freeze expirations"
          value={String(upcomingFreezeExpirations.length)}
          description="Frozen memberships ending within the next 7 days."
        />
        <PlaceholderCard
          title="Past due members"
          value={String(pastDueMembers.length)}
          description="Active subscriptions currently in billing trouble."
        />
        <PlaceholderCard
          title="Open recovery tasks"
          value={String(followUpTasks.length)}
          description="Follow-up tasks still waiting on staff action."
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">At-risk queue</h2>
          <p className="mt-1 text-sm text-muted">
            AI insights and operator flags that should be reviewed first.
          </p>
        </div>
        <div className="divide-y divide-border">
          {insights.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">No open retention insights right now.</div>
          ) : (
            insights.map((insight) => {
              const member = toOneRelation(insight.members);
              return (
                <div
                  key={insight.id}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{insight.title}</p>
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {insight.type.replace("_", " ")}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {insight.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {member ? `${member.first_name} ${member.last_name}` : "No member linked"}
                    </p>
                  </div>
                  {member ? (
                    <div className="flex items-center gap-3">
                      <Link
                        className="text-sm font-medium text-foreground"
                        href={`/dashboard/members/${member.id}/edit`}
                      >
                        Open member
                      </Link>
                      <MemberQuickNotifyForm
                        memberId={member.id}
                        redirectTo="/dashboard/retention"
                        title="We noticed a membership issue"
                        body={`Hi ${member.first_name}, ${insight.title.toLowerCase()}. We wanted to check in and help you get back on track.`}
                        type={insight.type === "failed_payment" ? "billing" : "retention"}
                        label="Notify"
                      />
                      <form action={createMemberFollowUpTaskAction}>
                        <input type="hidden" name="memberId" value={member.id} />
                        <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                        <input type="hidden" name="title" value={insight.title} />
                        <input
                          type="hidden"
                          name="details"
                          value={`Created from ${insight.type.replace("_", " ")} insight in the retention workspace.`}
                        />
                        <input type="hidden" name="taskType" value="retention" />
                        <input type="hidden" name="priority" value={insight.priority === "high" ? "high" : "medium"} />
                        <ServerActionButton
                          idleLabel="Create task"
                          pendingLabel="Creating..."
                          variant="ghost"
                          className="px-0 py-0 text-sm"
                        />
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">No-visit members</h2>
            <p className="mt-1 text-sm text-muted">
              Members who may need a check-in, nudge, or coaching touchpoint.
            </p>
          </div>
          <div className="divide-y divide-border">
            {noVisitMembers.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No long-gap attendance issues right now.</div>
            ) : (
              noVisitMembers.slice(0, 6).map((entry) => (
                <div
                  key={entry.member.id}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {entry.member.first_name} {entry.member.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.daysSinceLastVisit === null
                        ? "No check-ins recorded yet."
                        : `No visit in ${entry.daysSinceLastVisit} days.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      className="text-sm font-medium text-foreground"
                      href={`/dashboard/members/${entry.member.id}/edit`}
                    >
                      Open member
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={entry.member.id}
                      redirectTo="/dashboard/retention"
                      title="We miss seeing you at the gym"
                      body={`Hi ${entry.member.first_name}, we noticed you have not been in recently and wanted to check in. Let us know if you need help getting back into a routine.`}
                      type="retention"
                      label="Send nudge"
                    />
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                      <input type="hidden" name="title" value="Attendance recovery follow-up" />
                      <input
                        type="hidden"
                        name="details"
                        value={
                          entry.daysSinceLastVisit === null
                            ? "Member has no recorded check-ins yet and may need onboarding help."
                            : `Member has not visited in ${entry.daysSinceLastVisit} days.`
                        }
                      />
                      <input type="hidden" name="taskType" value="retention" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Create task"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-sm"
                      />
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Upcoming freeze expirations</h2>
            <p className="mt-1 text-sm text-muted">
              Frozen memberships that need renewal conversations before cancellation kicks in.
            </p>
          </div>
          <div className="divide-y divide-border">
            {upcomingFreezeExpirations.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No frozen memberships are close to expiring.</div>
            ) : (
              upcomingFreezeExpirations.map((entry) => (
                <div
                  key={entry.member.id}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {entry.member.first_name} {entry.member.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Frozen until {entry.member.frozen_until} | {entry.daysRemaining} day
                      {entry.daysRemaining === 1 ? "" : "s"} remaining
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      className="text-sm font-medium text-foreground"
                      href={`/dashboard/members/${entry.member.id}/edit`}
                    >
                      Open member
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={entry.member.id}
                      redirectTo="/dashboard/retention"
                      title="Your membership freeze is ending soon"
                      body={`Hi ${entry.member.first_name}, your freeze ends in ${entry.daysRemaining} day${entry.daysRemaining === 1 ? "" : "s"}. Resume your membership soon to avoid cancellation.`}
                      type="billing"
                      label="Send reminder"
                    />
                    <form action={resumeMemberMembershipAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                      <ServerActionButton
                        idleLabel="Renew"
                        pendingLabel="Renewing..."
                        variant="ghost"
                        className="px-0 py-0 text-sm"
                      />
                    </form>
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                      <input type="hidden" name="title" value="Freeze ending soon" />
                      <input
                        type="hidden"
                        name="details"
                        value={`Frozen membership ends in ${entry.daysRemaining} days and needs a renewal conversation.`}
                      />
                      <input type="hidden" name="taskType" value="retention" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Create task"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-sm"
                      />
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Billing retention risks</h2>
            <p className="mt-1 text-sm text-muted">
              Members at risk because billing is already breaking or incomplete.
            </p>
          </div>
          <div className="divide-y divide-border">
            {[...pastDueMembers, ...membersMissingCard].slice(0, 6).length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No active billing retention risks right now.</div>
            ) : (
              [...pastDueMembers, ...membersMissingCard].slice(0, 6).map((entry) => (
                <div
                  key={`${entry.member.id}-${entry.subscription?.id ?? "card"}`}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {entry.member.first_name} {entry.member.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.subscription?.status === "past_due"
                        ? `Past due on ${getPlanName(entry.subscription) ?? "current plan"}`
                        : `Missing card on file for ${getPlanName(entry.subscription) ?? "active plan"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      className="text-sm font-medium text-foreground"
                      href={`/dashboard/members/${entry.member.id}/edit`}
                    >
                      Open member
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={entry.member.id}
                      redirectTo="/dashboard/retention"
                      title={
                        entry.subscription?.status === "past_due"
                          ? "Your membership payment needs attention"
                          : "Please add a card to keep your membership active"
                      }
                      body={
                        entry.subscription?.status === "past_due"
                          ? `Hi ${entry.member.first_name}, your membership payment is currently past due. Please update it so your access stays active.`
                          : `Hi ${entry.member.first_name}, we still need a card on file for your membership. Please update your billing details to avoid interruption.`
                      }
                      type="billing"
                      label="Notify"
                    />
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                      <input
                        type="hidden"
                        name="title"
                        value={
                          entry.subscription?.status === "past_due"
                            ? "Resolve past due membership"
                            : "Collect payment method for active member"
                        }
                      />
                      <input
                        type="hidden"
                        name="details"
                        value={
                          entry.subscription?.status === "past_due"
                            ? "Billing recovery needed to prevent churn."
                            : "Member has an active plan but no saved card on file."
                        }
                      />
                      <input type="hidden" name="taskType" value="billing" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Create task"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-sm"
                      />
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Recovery task board</h2>
            <p className="mt-1 text-sm text-muted">
              Open tasks created from retention, billing, and front-desk issues.
            </p>
          </div>
          <div className="divide-y divide-border">
            {followUpTasks.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No open recovery tasks right now.</div>
            ) : (
              followUpTasks.map((task) => {
                const member = toOneRelation(task.members);
                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
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
                        {member ? `${member.first_name} ${member.last_name}` : "No member linked"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {member ? (
                        <Link
                          className="text-sm font-medium text-foreground"
                          href={`/dashboard/members/${member.id}/edit`}
                        >
                          Open member
                        </Link>
                      ) : null}
                      {member ? (
                        <form action={completeMemberFollowUpTaskAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <input type="hidden" name="redirectTo" value="/dashboard/retention" />
                          <ServerActionButton
                            idleLabel="Complete"
                            pendingLabel="Completing..."
                            variant="ghost"
                            className="px-0 py-0 text-sm"
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

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent membership events</h2>
          <p className="mt-1 text-sm text-muted">
            Freeze and cancellation activity tied to retention recovery.
          </p>
        </div>
        <div className="divide-y divide-border">
          {membershipEvents.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">No recent membership events.</div>
          ) : (
            membershipEvents.slice(0, 8).map((event) => {
              const member = toOneRelation(event.members);
              return (
                <div
                  key={event.id}
                  className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {member ? `${member.first_name} ${member.last_name}` : "Unknown member"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {event.event_type === "frozen"
                        ? `Membership frozen until ${event.frozen_until ?? "not set"}`
                        : "Membership canceled"}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {new Date(event.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}
