import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import {
  AIInsightCard,
  RunAnalysisButton
} from "@/app/(dashboard)/dashboard/ai-command-center/action-buttons";
import {
  groupInsightsByPriority,
  insightTypeMeta,
  type InsightWithMember
} from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AICommandCenterPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

const priorityStyles = {
  high: "border-rose-500/30 bg-rose-500/10",
  medium: "border-amber-500/30 bg-amber-500/10",
  low: "border-sky-500/30 bg-sky-500/10"
} as const;

const priorityLabels = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority"
} as const;

const insightTaskTypes: Record<string, "billing" | "retention" | "general"> = {
  failed_payment: "billing",
  missing_subscription: "billing",
  revenue_leak: "billing",
  retention_risk: "retention",
  inactivity: "retention",
  attendance_drop: "retention",
  upsell_opportunity: "general"
};

export default async function AICommandCenterPage({
  searchParams
}: AICommandCenterPageProps) {
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

  const [insightsResult, engagementScoresResult, topRiskResult, tasksResult] = await Promise.all([
    supabase
      .from("ai_insights")
      .select(
        `
          id,
          gym_id,
          member_id,
          type,
          title,
          description,
          priority,
          status,
          created_at,
          members (
            id,
            first_name,
            last_name,
            email
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
      .order("created_at", {
        ascending: false
      })
      .limit(80),
    supabase
      .from("member_scores")
      .select("engagement_score")
      .eq("gym_id", currentGym.data.membership.gymId)
      .limit(5000),
    supabase
      .from("member_scores")
      .select("retention_risk_score, last_calculated_at")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("retention_risk_score", {
        ascending: false
      })
      .limit(1),
    supabase
      .from("member_follow_up_tasks")
      .select("id, member_id, priority")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
      .limit(500)
  ]);

  if (insightsResult.error) {
    throw new Error(insightsResult.error.message);
  }

  if (engagementScoresResult.error) {
    throw new Error(engagementScoresResult.error.message);
  }

  if (topRiskResult.error) {
    throw new Error(topRiskResult.error.message);
  }

  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }

  const insights = ((insightsResult.data ?? []) as Array<
    Omit<InsightWithMember, "members"> & {
      members:
        | Array<Pick<NonNullable<InsightWithMember["members"]>, "id" | "first_name" | "last_name" | "email">>
        | null;
    }
  >).map((insight) => ({
    ...insight,
    members: Array.isArray(insight.members) ? (insight.members[0] ?? null) : insight.members
  })) as InsightWithMember[];
  const grouped = groupInsightsByPriority(insights);
  const engagementScores = engagementScoresResult.data ?? [];
  const topRiskScore = topRiskResult.data?.[0] ?? null;
  const openTasks = tasksResult.data ?? [];
  const revenueInsightCount = insights.filter((insight) =>
    [
      "failed_payment",
      "missing_subscription",
      "revenue_leak",
      "upsell_opportunity"
    ].includes(insight.type)
  ).length;
  const highestRisk = topRiskScore?.retention_risk_score ?? 0;
  const averageEngagement =
    engagementScores.length > 0
      ? Math.round(
          engagementScores.reduce((total, score) => total + score.engagement_score, 0) /
            engagementScores.length
        )
      : 0;
  const lastCalculatedAt = topRiskScore?.last_calculated_at ?? null;
  const openTaskCountByMember = new Map<string, number>();
  const highPriorityTaskCountByMember = new Map<string, number>();
  const insightCountByType = new Map<string, number>();

  openTasks.forEach((task) => {
    openTaskCountByMember.set(task.member_id, (openTaskCountByMember.get(task.member_id) ?? 0) + 1);
    if (task.priority === "high") {
      highPriorityTaskCountByMember.set(
        task.member_id,
        (highPriorityTaskCountByMember.get(task.member_id) ?? 0) + 1
      );
    }
  });

  insights.forEach((insight) => {
    insightCountByType.set(insight.type, (insightCountByType.get(insight.type) ?? 0) + 1);
  });

  const membersWithTaskCoverage = insights.filter(
    (insight) => insight.member_id && (openTaskCountByMember.get(insight.member_id) ?? 0) > 0
  ).length;
  const uncoveredMemberInsights = insights.filter(
    (insight) => insight.member_id && (openTaskCountByMember.get(insight.member_id) ?? 0) === 0
  ).length;
  const busiestInsightTypes = Object.entries(insightTypeMeta)
    .map(([type, meta]) => ({
      type,
      label: meta.label,
      count: insightCountByType.get(type) ?? 0
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <DashboardPageHeader
          eyebrow="AI Command Center"
          title="Member scoring and retention signals"
          description={`Action-oriented member and revenue insights for ${currentGym.data.membership.gymName}, generated from gym-scoped attendance and billing behavior.`}
        />
        <RunAnalysisButton />
      </div>

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Open insights"
          value={String(insights.length)}
          description="Signals needing operator follow-up right now."
        />
        <PlaceholderCard
          title="Revenue-linked insights"
          value={String(revenueInsightCount)}
          description="Billing blockers and expansion opportunities in this gym."
        />
        <PlaceholderCard
          title="Task-covered insights"
          value={String(membersWithTaskCoverage)}
          description="Member insights that already have an open staff task."
        />
        <PlaceholderCard
          title="Unassigned member insights"
          value={String(uncoveredMemberInsights)}
          description="Insights with no matching open follow-up task yet."
        />
        <PlaceholderCard
          title="Highest risk score"
          value={String(highestRisk)}
          description="Top retention risk score across scored members."
        />
        <PlaceholderCard
          title="Average engagement"
          value={String(averageEngagement)}
          description={
            lastCalculatedAt
              ? `Last calculated ${new Date(lastCalculatedAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: currentGym.data.membership.gymTimezone
                })}.`
              : "Run analysis to generate the first score set."
          }
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Insight mix</h2>
          <p className="mt-1 text-sm text-muted">
            Which signal types are dominating the queue right now.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          {busiestInsightTypes.length === 0 ? (
            <div className="text-sm text-muted">No open insights to summarize yet.</div>
          ) : (
            busiestInsightTypes.map((entry) => (
              <div
                key={entry.type}
                className="rounded-3xl border border-border bg-panel-elevated p-4"
              >
                <p className="text-sm text-muted">{entry.label}</p>
                <p className="mt-2 text-2xl font-semibold">{entry.count}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {(["high", "medium", "low"] as const).map((priority) => (
        <section key={priority} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{priorityLabels[priority]}</h2>
            <p className="text-sm text-muted">
              {grouped[priority].length} open insight
              {grouped[priority].length === 1 ? "" : "s"}
            </p>
          </div>
          {grouped[priority].length === 0 ? (
            <div className="panel px-5 py-6 text-sm text-muted">
              No {priority} priority insights are open.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {grouped[priority].map((insight) => (
                <AIInsightCard
                  createdAtLabel={new Date(insight.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: currentGym.data.membership.gymTimezone
                  })}
                  key={insight.id}
                  highPriorityTaskCount={
                    insight.member_id
                      ? (highPriorityTaskCountByMember.get(insight.member_id) ?? 0)
                      : 0
                  }
                  insight={insight}
                  insightLabel={insightTypeMeta[insight.type].label}
                  openTaskCount={
                    insight.member_id ? (openTaskCountByMember.get(insight.member_id) ?? 0) : 0
                  }
                  priorityClassName={priorityStyles[priority]}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
