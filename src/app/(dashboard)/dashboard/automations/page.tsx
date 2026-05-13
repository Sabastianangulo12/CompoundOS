import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { toggleAutomationAction } from "@/app/(dashboard)/dashboard/automations/actions";
import {
  automationActionLabels,
  automationTriggerLabels,
  ensureStarterAutomationsForGym
} from "@/lib/automations";
import { insightTypeMeta } from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AIInsight,
  Automation,
  AutomationLog,
  Member
} from "@/types/database";

type AutomationLogWithRelations = AutomationLog & {
  automations: Pick<Automation, "id" | "name"> | null;
  members: Pick<Member, "id" | "first_name" | "last_name"> | null;
  ai_insights: Pick<AIInsight, "id" | "type" | "title"> | null;
};

type AutomationsPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

function formatInsightTypeLabel(value: Automation["insight_type"]) {
  if (!value) {
    return "Any insight";
  }

  return insightTypeMeta[value].label;
}

export default async function AutomationsPage({
  searchParams
}: AutomationsPageProps) {
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

  const { error: starterError } = await ensureStarterAutomationsForGym(
    supabase,
    currentGym.data.membership.gymId
  );

  if (starterError) {
    throw new Error(starterError.message);
  }

  const [automationsResult, logsResult] = await Promise.all([
    supabase
      .from("automations")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: true
      }),
    supabase
      .from("automation_logs")
      .select(
        `
          *,
          automations (
            id,
            name
          ),
          members (
            id,
            first_name,
            last_name
          ),
          ai_insights (
            id,
            type,
            title
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: false
      })
      .limit(24)
  ]);

  if (automationsResult.error) {
    throw new Error(automationsResult.error.message);
  }

  if (logsResult.error) {
    throw new Error(logsResult.error.message);
  }

  const automations = automationsResult.data ?? [];
  const logs = (logsResult.data ?? []) as AutomationLogWithRelations[];
  const lastRunByAutomation = new Map<string, AutomationLogWithRelations>();

  logs.forEach((log) => {
    if (!lastRunByAutomation.has(log.automation_id)) {
      lastRunByAutomation.set(log.automation_id, log);
    }
  });

  const activeAutomations = automations.filter((automation) => automation.is_active);
  const successfulLogs = logs.filter((log) => log.result === "success");
  const skippedLogs = logs.filter((log) => log.result === "skipped");

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Automations"
        title="Insight-driven automation rules"
        description={`Simple internal automations for ${currentGym.data.membership.gymName}. Trigger actions from AI insights without exposing tenant controls in the client.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="Active automations"
          value={String(activeAutomations.length)}
          description="Rules currently watching for new insight events."
        />
        <PlaceholderCard
          title="Successful runs"
          value={String(successfulLogs.length)}
          description="Recent automation actions completed for this gym."
        />
        <PlaceholderCard
          title="Skipped events"
          value={String(skippedLogs.length)}
          description="Insight events without an active matching automation."
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Automation rules</h2>
          <p className="mt-1 text-sm text-muted">
            Keep follow-up actions lightweight for now: internal logs and insight creation only.
          </p>
        </div>
        <div className="divide-y divide-border">
          {automations.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No automations available yet.
            </div>
          ) : (
            automations.map((automation) => {
              const lastRun = lastRunByAutomation.get(automation.id);

              return (
                <article
                  key={automation.id}
                  className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-center xl:justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{automation.name}</h3>
                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
                          automation.is_active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : "border-border bg-black/20 text-muted"
                        ].join(" ")}
                      >
                        {automation.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {automationTriggerLabels[automation.trigger_type]} |{" "}
                      {formatInsightTypeLabel(automation.insight_type)} |{" "}
                      {automationActionLabels[automation.action_type]}
                    </p>
                    <p className="text-sm text-muted">
                      {lastRun
                        ? `Last run ${new Date(lastRun.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: currentGym.data.membership.gymTimezone
                          })}: ${lastRun.message}`
                        : "No runs logged yet."}
                    </p>
                  </div>
                  <form action={toggleAutomationAction}>
                    <input type="hidden" name="automationId" value={automation.id} />
                    <input
                      type="hidden"
                      name="nextValue"
                      value={automation.is_active ? "false" : "true"}
                    />
                    <button
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-medium",
                        automation.is_active
                          ? "border border-border text-muted hover:text-foreground"
                          : "bg-accent text-black"
                      ].join(" ")}
                      type="submit"
                    >
                      {automation.is_active ? "Pause" : "Activate"}
                    </button>
                  </form>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent logs</h2>
          <p className="mt-1 text-sm text-muted">
            A compact view of what fired, what was skipped, and which member or insight was involved.
          </p>
        </div>
        <div className="divide-y divide-border">
          {logs.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No automation logs yet.
            </div>
          ) : (
            logs.map((log) => (
              <article
                key={log.id}
                className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {log.automations?.name ?? "Automation"}
                    </p>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
                        log.result === "success"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      ].join(" ")}
                    >
                      {log.result}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{log.message}</p>
                  <p className="mt-2 text-sm text-muted">
                    {log.members
                      ? `${log.members.first_name} ${log.members.last_name}`
                      : "No member linked"}
                    {log.ai_insights
                      ? ` | ${insightTypeMeta[log.ai_insights.type].label}`
                      : ""}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {new Date(log.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: currentGym.data.membership.gymTimezone
                  })}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
