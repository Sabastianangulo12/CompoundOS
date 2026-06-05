import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { formatCurrencyFromCents, getRevenueSnapshot } from "@/lib/revenue";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
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
    revenueSnapshot,
    membersResult,
    subscriptionsResult,
    pastDueSubscriptionsResult,
    paymentsResult,
    membershipEventsResult,
    topMembersResult,
    followUpTasksResult
  ] = await Promise.all([
    getRevenueSnapshot(supabase, gymId),
    supabase
      .from("members")
      .select("status", { count: "exact" })
      .eq("gym_id", gymId),
    supabase
      .from("subscriptions")
      .select("status", { count: "exact" })
      .eq("gym_id", gymId),
    supabase
      .from("subscriptions")
      .select(
        `
          id,
          status,
          current_period_end,
          member_id,
          members (
            id,
            first_name,
            last_name,
            email
          ),
          membership_plans (
            name
          )
        `
      )
      .eq("gym_id", gymId)
      .eq("status", "past_due")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("payments")
      .select("amount_cents, status")
      .eq("gym_id", gymId)
      .limit(1000),
    supabase
      .from("member_membership_events")
      .select("event_type")
      .eq("gym_id", gymId)
      .limit(1000),
    supabase
      .from("members")
      .select(
        `
          id,
          first_name,
          last_name,
          check_ins (
            id
          )
        `
      )
      .eq("gym_id", gymId)
      .neq("status", "canceled")
      .limit(200),
    supabase
      .from("member_follow_up_tasks")
      .select("status, priority")
      .eq("gym_id", gymId)
      .limit(1000)
  ]);

  if (revenueSnapshot.error) {
    throw new Error(revenueSnapshot.error.message);
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

  if (pastDueSubscriptionsResult.error) {
    throw new Error(pastDueSubscriptionsResult.error.message);
  }

  if (membershipEventsResult.error) {
    throw new Error(membershipEventsResult.error.message);
  }

  if (topMembersResult.error) {
    throw new Error(topMembersResult.error.message);
  }

  if (followUpTasksResult.error) {
    throw new Error(followUpTasksResult.error.message);
  }

  const members = membersResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const pastDueSubscriptions = (pastDueSubscriptionsResult.data ?? []) as Array<{
    id: string;
    status: string;
    current_period_end: string | null;
    member_id: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
    }> | null;
    membership_plans: Array<{
      name: string;
    }> | null;
  }>;
  const payments = paymentsResult.data ?? [];
  const membershipEvents = membershipEventsResult.data ?? [];
  const followUpTasks = (followUpTasksResult.data ?? []) as Array<{
    status: string;
    priority: string;
  }>;
  const openFollowUpTasks = (await supabase
    .from("member_follow_up_tasks")
    .select(
      `
        id,
        title,
        priority,
        task_type,
        due_at,
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
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(5)).data as Array<{
      id: string;
      title: string;
      priority: string;
      task_type: string;
      due_at: string | null;
      member_id: string;
      members: Array<{
        id: string;
        first_name: string;
        last_name: string;
      }> | null;
    }> | null ?? [];
  const topMembers = (topMembersResult.data ?? [])
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      checkInCount: member.check_ins.length
    }))
    .sort((a, b) => b.checkInCount - a.checkInCount)
    .slice(0, 5);

  const activeMembers = members.filter((member) => member.status === "active").length;
  const frozenMembers = members.filter((member) => member.status === "frozen").length;
  const leads = members.filter((member) => member.status === "lead").length;
  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "active"
  ).length;
  const trialingSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "trialing"
  ).length;
  const pastDueSubscriptionCount = subscriptions.filter(
    (subscription) => subscription.status === "past_due"
  ).length;
  const succeededPayments = payments.filter((payment) => payment.status === "succeeded");
  const grossCollectedCents = succeededPayments.reduce(
    (total, payment) => total + payment.amount_cents,
    0
  );
  const failedPayments = payments.filter((payment) => payment.status === "failed").length;
  const totalFreezes = membershipEvents.filter((event) => event.event_type === "frozen").length;
  const totalCancels = membershipEvents.filter((event) => event.event_type === "canceled").length;
  const openFollowUps = followUpTasks.filter((task) => task.status === "open").length;
  const highPriorityFollowUps = followUpTasks.filter(
    (task) => task.status === "open" && task.priority === "high"
  ).length;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Reports"
        title="Operations snapshot"
        description={`Core membership, revenue, and attendance reporting for ${currentGym.data.membership.gymName}.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Active members"
          value={String(activeMembers)}
          description={`${frozenMembers} frozen and ${leads} leads currently in the system.`}
        />
        <PlaceholderCard
          title="Estimated MRR"
          value={formatCurrencyFromCents(
            revenueSnapshot.estimatedMonthlyRecurringRevenue
          )}
          description="Projected from active and trialing subscriptions."
        />
        <PlaceholderCard
          title="Gross collected"
          value={formatCurrencyFromCents(grossCollectedCents)}
          description={`${failedPayments} failed payment${failedPayments === 1 ? "" : "s"} recorded.`}
        />
        <PlaceholderCard
          title="Lifecycle events"
          value={String(totalFreezes + totalCancels)}
          description={`${totalFreezes} freezes and ${totalCancels} cancellations recorded.`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Subscription mix</h2>
            <p className="mt-1 text-sm text-muted">
              Current subscription state across the gym.
            </p>
          </div>
          <div className="grid gap-4 px-6 py-6 md:grid-cols-3">
            <PlaceholderCard
              title="Active"
              value={String(activeSubscriptions)}
              description="Members in good standing."
            />
            <PlaceholderCard
              title="Trialing"
              value={String(trialingSubscriptions)}
              description="Members currently in a trial period."
            />
            <PlaceholderCard
              title="Past due"
              value={String(pastDueSubscriptionCount)}
              description="Members needing billing recovery."
            />
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Top attendance</h2>
            <p className="mt-1 text-sm text-muted">
              Most active members based on recorded check-ins.
            </p>
          </div>
          <div className="divide-y divide-border">
            {topMembers.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">
                No attendance data yet.
              </div>
            ) : (
              topMembers.map((member, index) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div>
                    <p className="font-medium">
                      {index + 1}. {member.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {member.checkInCount} total check-in
                      {member.checkInCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link
                    className="text-sm font-medium text-foreground"
                    href={`/dashboard/members/${member.id}/edit`}
                  >
                    Open member
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Billing recovery queue</h2>
            <p className="mt-1 text-sm text-muted">
              Members whose subscriptions are already in billing trouble.
            </p>
          </div>
          <div className="divide-y divide-border">
            {pastDueSubscriptions.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">
                No past-due subscriptions right now.
              </div>
            ) : (
              pastDueSubscriptions.map((subscription) => {
                const member = toOneRelation(subscription.members);
                return (
                  <div
                    key={subscription.id}
                    className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {member
                          ? `${member.first_name} ${member.last_name}`
                          : "Unknown member"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {toOneRelation(subscription.membership_plans)?.name ?? "Unknown plan"} -{" "}
                        {member?.email ?? "No email"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {subscription.current_period_end
                          ? `Current period ended ${new Date(
                              subscription.current_period_end
                            ).toLocaleDateString("en-US", {
                              dateStyle: "medium"
                            })}`
                          : "Current period end not set"}
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
                          redirectTo="/dashboard/reports"
                          title="Your membership payment needs attention"
                          body={`Hi ${member.first_name}, your ${toOneRelation(subscription.membership_plans)?.name ?? "membership"} payment is currently past due. Please update it so your account stays active.`}
                          type="billing"
                          label="Notify"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Follow-up workload</h2>
            <p className="mt-1 text-sm text-muted">
              Open staff tasks created from billing, attendance, and retention work.
            </p>
          </div>
          <div className="grid gap-4 border-b border-border px-6 py-6 md:grid-cols-2">
            <PlaceholderCard
              title="Open follow-ups"
              value={String(openFollowUps)}
              description="Outstanding operator tasks still waiting on action."
            />
            <PlaceholderCard
              title="High priority"
              value={String(highPriorityFollowUps)}
              description="Urgent retention, billing, or front desk tasks."
            />
          </div>
          <div className="divide-y divide-border">
            {openFollowUpTasks.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">
                No open follow-up tasks right now.
              </div>
            ) : (
              openFollowUpTasks.map((task) => {
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
                        {member
                          ? `${member.first_name} ${member.last_name}`
                          : "Member unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {task.due_at
                          ? `Due ${new Date(task.due_at).toLocaleString("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: currentGym.data.membership.gymTimezone
                            })}`
                          : "No due date set"}
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
                          redirectTo="/dashboard/reports"
                          title="We have a follow-up for your account"
                          body={`Hi ${member.first_name}, we have an open ${task.task_type.replace("_", " ")} follow-up on your account and wanted to connect with you.`}
                          type={task.task_type === "billing" ? "billing" : "retention"}
                          label="Notify"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
