import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { countTodayCheckIns, getRecentCheckInsForGym } from "@/lib/check-ins";
import { getCurrentGymContext } from "@/lib/gym-users";
import { getRevenueSnapshot } from "@/lib/revenue";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    throw new Error(currentGym.error?.message ?? "No gym context found.");
  }

  const [membersCountResult, recentCheckInsResult, revenueSnapshot, aiInsightsResult] =
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
        .eq("status", "open")
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
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            Revenue actions
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            {revenueActions} revenue-linked insight{revenueActions === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Failed payments, missing subscriptions, past-due plans, and upsell
            opportunities now flow into the AI Command Center.
          </p>
        </div>
        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            Priority queue
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            {highPriorityActions} high-priority action
            {highPriorityActions === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Use the AI Command Center to review the members and revenue issues
            that need attention first.
          </p>
        </div>
      </section>
      <section className="panel p-6">
        <h2 className="text-xl font-semibold">What's included</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          This initial scaffold sets up the route groups, dashboard shell,
          Supabase client entry point, and tenant-scoped tables for gyms,
          members, check-ins, revenue, and AI insights. It is intentionally
          lean so the product model can evolve cleanly.
        </p>
      </section>
    </div>
  );
}
