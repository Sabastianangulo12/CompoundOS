import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import {
  dismissInsightAction,
  runMemberScoringAction
} from "@/app/(dashboard)/dashboard/ai-command-center/actions";
import {
  groupInsightsByPriority,
  insightTypeMeta,
  type InsightWithMember
} from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const [insightsResult, scoreResult] = await Promise.all([
    supabase
      .from("ai_insights")
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
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
      .order("created_at", {
        ascending: false
      }),
    supabase
      .from("member_scores")
      .select("engagement_score, retention_risk_score, last_calculated_at")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("retention_risk_score", {
        ascending: false
      })
  ]);

  if (insightsResult.error) {
    throw new Error(insightsResult.error.message);
  }

  if (scoreResult.error) {
    throw new Error(scoreResult.error.message);
  }

  const insights = (insightsResult.data ?? []) as InsightWithMember[];
  const grouped = groupInsightsByPriority(insights);
  const scores = scoreResult.data ?? [];
  const revenueInsightCount = insights.filter((insight) =>
    [
      "failed_payment",
      "missing_subscription",
      "revenue_leak",
      "upsell_opportunity"
    ].includes(insight.type)
  ).length;
  const highestRisk = scores[0]?.retention_risk_score ?? 0;
  const averageEngagement =
    scores.length > 0
      ? Math.round(
          scores.reduce((total, score) => total + score.engagement_score, 0) /
            scores.length
        )
      : 0;
  const lastCalculatedAt = scores[0]?.last_calculated_at ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <DashboardPageHeader
          eyebrow="AI Command Center"
          title="Member scoring and retention signals"
          description={`Action-oriented member and revenue insights for ${currentGym.data.membership.gymName}, generated from gym-scoped attendance and billing behavior.`}
        />
        <form action={runMemberScoringAction}>
          <button
            className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-black"
            type="submit"
          >
            Run analysis
          </button>
        </form>
      </div>

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="panel p-5">
          <p className="text-sm text-muted">Open insights</p>
          <p className="mt-3 text-3xl font-semibold">{insights.length}</p>
          <p className="mt-2 text-sm text-muted">
            Signals needing operator follow-up right now.
          </p>
        </section>
        <section className="panel p-5">
          <p className="text-sm text-muted">Revenue-linked insights</p>
          <p className="mt-3 text-3xl font-semibold">{revenueInsightCount}</p>
          <p className="mt-2 text-sm text-muted">
            Billing blockers and expansion opportunities in the current gym.
          </p>
        </section>
        <section className="panel p-5">
          <p className="text-sm text-muted">Highest risk score</p>
          <p className="mt-3 text-3xl font-semibold">{highestRisk}</p>
          <p className="mt-2 text-sm text-muted">
            Top retention risk score across scored members.
          </p>
        </section>
        <section className="panel p-5 md:col-span-3 xl:col-span-1">
          <p className="text-sm text-muted">Average engagement</p>
          <p className="mt-3 text-3xl font-semibold">{averageEngagement}</p>
          <p className="mt-2 text-sm text-muted">
            {lastCalculatedAt
              ? `Last calculated ${new Date(lastCalculatedAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: currentGym.data.membership.gymTimezone
                })}.`
              : "Run analysis to generate the first score set."}
          </p>
        </section>
      </div>

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
                <article
                  key={insight.id}
                  className={[
                    "panel flex flex-col gap-4 p-5",
                    priorityStyles[priority]
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted">
                        {insightTypeMeta[insight.type].icon} |{" "}
                        {insightTypeMeta[insight.type].label}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold">
                        {insight.title}
                      </h3>
                    </div>
                    <form action={dismissInsightAction}>
                      <input name="insightId" type="hidden" value={insight.id} />
                      <button
                        className="rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
                        type="submit"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                  <p className="text-sm text-muted">{insight.description}</p>
                  <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {insight.members
                          ? `${insight.members.first_name} ${insight.members.last_name}`
                          : "Gym-level insight"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {insight.members?.email ?? "No member email on file"}
                      </p>
                    </div>
                    {insight.member_id ? (
                      <Link
                        className="text-sm font-medium text-foreground"
                        href={`/dashboard/members/${insight.member_id}/edit`}
                      >
                        Open member
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
