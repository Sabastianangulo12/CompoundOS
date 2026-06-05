import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { countTodayCheckIns, getRecentCheckInsForGym } from "@/lib/check-ins";
import { getCurrentGymContext } from "@/lib/gym-users";
import { syncGymFrozenMemberships } from "@/lib/member-billing";
import { getRevenueSnapshot } from "@/lib/revenue";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getEventMemberName(
  members:
    | {
        first_name: string;
        last_name: string;
      }
    | Array<{
        first_name: string;
        last_name: string;
      }>
    | null
) {
  const member = toOneRelation(members);
  return member ? `${member.first_name} ${member.last_name}` : "Member";
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    if (currentGym.error) {
      redirect(
        `/login?message=${encodeURIComponent(currentGym.error.message)}`
      );
    }

    redirect("/onboarding/create-gym");
  }

  const admin = createSupabaseAdminClient();
  void syncGymFrozenMemberships(admin, currentGym.data.membership.gymId).catch(
    (error) => {
      console.error("Dashboard frozen membership sync failed", error);
    }
  );

  const [
    membersCountResult,
    recentCheckInsResult,
    revenueSnapshot,
    aiInsightsResult,
    frozenMembershipEventsResult,
    canceledMembershipEventsResult,
    challengesResult,
    spotlightsResult,
    openTasksResult,
    highPriorityInsightsResult,
    urgentTasksResult
  ] =
    await Promise.all([
      supabase
        .from("members")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "active"),
      getRecentCheckInsForGym(supabase, currentGym.data.membership.gymId, 200),
      getRevenueSnapshot(supabase, currentGym.data.membership.gymId),
      supabase
        .from("ai_insights")
        .select("id, type, priority", {
          count: "exact"
        })
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "open"),
      supabase
        .from("member_membership_events")
        .select(
          `
            id,
            event_type,
            reason,
            frozen_until,
            created_at,
            members (
              first_name,
              last_name
            )
          `
        )
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("event_type", "frozen")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("member_membership_events")
        .select(
          `
            id,
            event_type,
            reason,
            frozen_until,
            created_at,
            members (
              first_name,
              last_name
            )
          `
        )
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("event_type", "canceled")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("gym_challenges")
        .select("id, title, metric_type, goal_value")
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("gym_member_spotlights")
        .select(
          `
            id,
            title,
            members (
              first_name,
              last_name
            )
          `
        )
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("member_follow_up_tasks")
        .select("id, title, priority, task_type", { count: "exact" })
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "open"),
      supabase
        .from("ai_insights")
        .select(
          `
            id,
            title,
            type,
            priority,
            member_id,
            members (
              id,
              first_name,
              last_name
            )
          `
        )
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "open")
        .eq("priority", "high")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
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
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("status", "open")
        .order("priority", { ascending: false })
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(5)
    ]);

  if (membersCountResult.error) {
    throw new Error(membersCountResult.error.message);
  }

  if (recentCheckInsResult.error) {
    throw new Error(recentCheckInsResult.error.message);
  }

  if (revenueSnapshot.error) {
    throw new Error(revenueSnapshot.error.message);
  }

  if (aiInsightsResult.error) {
    throw new Error(aiInsightsResult.error.message);
  }

  if (frozenMembershipEventsResult.error) {
    throw new Error(frozenMembershipEventsResult.error.message);
  }

  if (canceledMembershipEventsResult.error) {
    throw new Error(canceledMembershipEventsResult.error.message);
  }
  if (challengesResult.error) {
    throw new Error(challengesResult.error.message);
  }
  if (spotlightsResult.error) {
    throw new Error(spotlightsResult.error.message);
  }
  if (openTasksResult.error) {
    throw new Error(openTasksResult.error.message);
  }
  if (highPriorityInsightsResult.error) {
    throw new Error(highPriorityInsightsResult.error.message);
  }
  if (urgentTasksResult.error) {
    throw new Error(urgentTasksResult.error.message);
  }

  const todaysCheckIns = countTodayCheckIns(
    recentCheckInsResult.data,
    currentGym.data.membership.gymTimezone
  );
  const revenueActions =
    aiInsightsResult.data?.filter((insight) =>
      [
        "failed_payment",
        "missing_subscription",
        "revenue_leak",
        "upsell_opportunity"
      ].includes(insight.type)
    ).length ?? 0;
  const highPriorityActions =
    aiInsightsResult.data?.filter((insight) => insight.priority === "high").length ?? 0;
  const activeChallenges = challengesResult.data ?? [];
  const openTasks = openTasksResult.data ?? [];
  const highPriorityTasks = openTasks.filter((task) => task.priority === "high").length;
  const highPriorityInsights = (highPriorityInsightsResult.data ?? []) as Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    member_id: string | null;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  const urgentTasks = (urgentTasksResult.data ?? []) as Array<{
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
  }>;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Owner dashboard"
        title="Welcome back to the club"
        description="A calm starting point for multi-location operations."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Active members"
          value={String(membersCountResult.count ?? 0)}
          description="Current active members in this gym."
        />
        <PlaceholderCard
          title="Today's check-ins"
          value={String(todaysCheckIns)}
          description="Manual front-desk activity recorded today."
        />
        <PlaceholderCard
          title="Estimated MRR"
          value={new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
          }).format(revenueSnapshot.estimatedMonthlyRecurringRevenue / 100)}
          description="Projected from active and trialing subscriptions."
        />
        <PlaceholderCard
          title="Open AI actions"
          value={String(aiInsightsResult.count ?? 0)}
          description="Actionable retention and revenue signals across the gym."
        />
        <PlaceholderCard
          title="Open follow-ups"
          value={String(openTasksResult.count ?? 0)}
          description="Internal staff tasks still waiting on action."
        />
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel-hero p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Revenue actions
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                {revenueActions} revenue-linked insight{revenueActions === 1 ? "" : "s"}
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/ai-command-center">
              Open command center
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">
            Failed payments, missing subscriptions, past-due plans, and upsell
            opportunities now flow into the AI Command Center.
          </p>
        </div>
        <div className="panel-hero p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Priority queue
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                {highPriorityActions} high-priority action
                {highPriorityActions === 1 ? "" : "s"}
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/reports">
              Review workload
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">
            Use the AI Command Center to review the members and revenue issues
            that need attention first.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted">
            <span className="status-pill">Staff queue</span>
            <span>
              {highPriorityTasks} high-priority follow-up task{highPriorityTasks === 1 ? "" : "s"} currently open.
            </span>
          </div>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Immediate member risks
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Intervene before members churn or payment issues spread.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/ai-command-center">
              View all insights
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {highPriorityInsights.length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">No high-priority insights are open right now.</p>
              </div>
            ) : (
              highPriorityInsights.map((insight) => {
                const member = toOneRelation(insight.members);
                return (
                  <div
                    key={insight.id}
                    className="panel-soft p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="status-pill">High priority</span>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                            {insight.type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-foreground">{insight.title}</p>
                        <p className="mt-1 text-sm text-muted">
                          {member
                            ? `${member.first_name} ${member.last_name}`
                            : "Gym-level insight"}
                        </p>
                      </div>
                      {insight.member_id ? (
                        <div className="flex items-center gap-3">
                          <Link
                            className="action-link"
                            href={`/dashboard/members/${insight.member_id}/edit`}
                          >
                            Open
                          </Link>
                          <MemberQuickNotifyForm
                            memberId={insight.member_id}
                            redirectTo="/dashboard"
                            title="We wanted to check in with you"
                            body={`Hi ${member?.first_name ?? "there"}, we noticed a membership issue and wanted to reach out so we can help.`}
                            type={insight.type === "failed_payment" ? "billing" : "retention"}
                            label="Notify"
                          />
                        </div>
                      ) : (
                        <Link
                          className="action-link"
                          href="/dashboard/ai-command-center"
                        >
                          Review
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Urgent follow-ups
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Keep staff follow-through visible and moving.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/reports">
              Open reports
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {urgentTasks.length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">No urgent follow-up tasks are open right now.</p>
              </div>
            ) : (
              urgentTasks.map((task) => {
                const member = toOneRelation(task.members);
                return (
                  <div
                    key={task.id}
                    className="panel-soft p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="status-pill">
                            {task.priority === "high" ? "Urgent" : "Open"}
                          </span>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                            {task.task_type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-foreground">{task.title}</p>
                        <p className="mt-1 text-sm text-muted">
                          {member
                            ? `${member.first_name} ${member.last_name}`
                            : "Member unavailable"}
                        </p>
                        <p className="mt-2 text-xs text-muted">
                          {task.due_at
                            ? `Due ${new Date(task.due_at).toLocaleString("en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: currentGym.data.membership.gymTimezone
                              })}`
                            : "No due date set"}
                        </p>
                      </div>
                      {task.member_id ? (
                        <div className="flex items-center gap-3">
                          <Link
                            className="action-link"
                            href={`/dashboard/members/${task.member_id}/edit`}
                          >
                            Open
                          </Link>
                          <MemberQuickNotifyForm
                            memberId={task.member_id}
                            redirectTo="/dashboard"
                            title="We have a follow-up on your account"
                            body={`Hi ${member?.first_name ?? "there"}, we have an open ${task.task_type.replaceAll("_", " ")} follow-up and wanted to connect with you.`}
                            type={task.task_type === "billing" ? "billing" : "retention"}
                            label="Notify"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Live challenges
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Keep momentum visible across the floor.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/challenges">
              Manage challenges
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {activeChallenges.length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">No active challenges yet.</p>
              </div>
            ) : (
              activeChallenges.map((challenge) => (
                <div
                  key={challenge.id}
                  className="panel-soft p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{challenge.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {challenge.metric_type} goal {challenge.goal_value}
                      </p>
                    </div>
                    <span className="status-pill">Active</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Active spotlights
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Showcase the members shaping your culture.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/culture">
              Manage culture
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {(spotlightsResult.data ?? []).length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">No active member spotlights.</p>
              </div>
            ) : (
              (spotlightsResult.data ?? []).map((spotlight) => (
                <div
                  key={spotlight.id}
                  className="panel-soft p-4"
                >
                  <p className="text-sm font-medium text-foreground">{spotlight.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {getEventMemberName(
                      spotlight.members as
                        | {
                            first_name: string;
                            last_name: string;
                          }
                        | Array<{
                            first_name: string;
                            last_name: string;
                          }>
                        | null
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Frozen memberships
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Monitor paused revenue before it quietly turns into churn.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/revenue">
              Open revenue
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {(frozenMembershipEventsResult.data ?? []).length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">
                  No recent account freezes.
                </p>
              </div>
            ) : (
              (frozenMembershipEventsResult.data ?? []).map((event) => (
                <div
                  key={event.id}
                  className="panel-soft p-4"
                >
                  <p className="text-sm font-medium text-foreground">
                    {getEventMemberName(
                      event.members as
                        | {
                            first_name: string;
                            last_name: string;
                          }
                        | Array<{
                            first_name: string;
                            last_name: string;
                          }>
                        | null
                    )}{" "}
                    froze their membership
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Frozen until {event.frozen_until ?? "not set"}.
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                Canceled memberships
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Track exits clearly so your recovery loop stays sharp.
              </h2>
            </div>
            <Link className="action-link" href="/dashboard/reports">
              Review reports
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {(canceledMembershipEventsResult.data ?? []).length === 0 ? (
              <div className="panel-soft p-4">
                <p className="text-sm text-muted">
                  No recent cancellations.
                </p>
              </div>
            ) : (
              (canceledMembershipEventsResult.data ?? []).map((event) => (
                <div
                  key={event.id}
                  className="panel-soft p-4"
                >
                  <p className="text-sm font-medium text-foreground">
                    {getEventMemberName(
                      event.members as
                        | {
                            first_name: string;
                            last_name: string;
                          }
                        | Array<{
                            first_name: string;
                            last_name: string;
                          }>
                        | null
                    )}{" "}
                    canceled their membership
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {event.reason === "freeze_expired"
                      ? "Canceled automatically after the 4-week freeze ended."
                      : "Canceled by member request."}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
