import {
  ensureStarterAutomationsForGym,
  shouldAutomationRunForInsight
} from "@/lib/automations";
import {
  createAndSendMemberNotification,
  mapInsightTypeToNotificationType
} from "@/lib/notifications";
import { logOpsEvent, serializeError } from "@/lib/observability";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type InsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];

type AutomationRunOptions = {
  maxInsights?: number;
};

async function executeAutomationForInsight(
  supabase: AppSupabaseClient,
  automation: AutomationRow,
  insight: InsightRow
) {
  const message = buildAutomationMessage(automation, insight);

  if (automation.action_type === "log_action") {
    const { error } = await supabase.from("automation_logs").insert({
      gym_id: automation.gym_id,
      automation_id: automation.id,
      member_id: insight.member_id,
      insight_id: insight.id,
      result: "success",
      message
    });

    return {
      error
    };
  }

  const { error: createdInsightError } = await supabase.from("ai_insights").insert(
    {
      gym_id: automation.gym_id,
      member_id: insight.member_id,
      type: insight.type,
      title: `Automation: ${automation.name}`,
      description: `Created from automation after insight "${insight.title}".`,
      priority: "low",
      status: "open"
    }
  );

  if (createdInsightError) {
    return {
      error: createdInsightError
    };
  }

  const { error: logError } = await supabase.from("automation_logs").insert({
    gym_id: automation.gym_id,
    automation_id: automation.id,
    member_id: insight.member_id,
    insight_id: insight.id,
    result: "success",
    message: `Created internal follow-up insight from "${insight.title}".`
  });

  return {
    error: logError
  };
}

async function maybeSendAutomationNotification(
  supabase: AppSupabaseClient,
  automation: AutomationRow,
  insight: InsightRow
) {
  if (!insight.member_id) {
    return {
      error: null,
      sent: false
    };
  }

  const notificationResult = await createAndSendMemberNotification(supabase, {
    gymId: automation.gym_id,
    memberId: insight.member_id,
    title: insight.title,
    body: insight.description,
    type: mapInsightTypeToNotificationType(insight.type)
  });

  return {
    error: notificationResult.error,
    sent: Boolean(notificationResult.sent)
  };
}

function buildAutomationMessage(
  automation: AutomationRow,
  insight: InsightRow
) {
  if (automation.insight_type === "retention_risk") {
    return `Follow up with member after "${insight.title}".`;
  }

  if (automation.insight_type === "failed_payment") {
    return `Retry payment workflow for "${insight.title}".`;
  }

  if (automation.insight_type === "upsell_opportunity") {
    return `Send offer workflow for "${insight.title}".`;
  }

  return `Automation "${automation.name}" ran for insight "${insight.title}".`;
}

async function logSkippedInsight(
  supabase: AppSupabaseClient,
  gymId: string,
  insight: InsightRow
) {
  const { data: fallbackAutomation, error: fallbackError } = await supabase
    .from("automations")
    .select("id")
    .eq("gym_id", gymId)
    .order("created_at", {
      ascending: true
    })
    .limit(1)
    .maybeSingle();

  if (fallbackError || !fallbackAutomation) {
    return {
      error: fallbackError ?? null
    };
  }

  const { error } = await supabase.from("automation_logs").insert({
    gym_id: gymId,
    automation_id: fallbackAutomation.id,
    member_id: insight.member_id,
    insight_id: insight.id,
    result: "skipped",
    message: `No active automation matched the ${insight.type.replaceAll("_", " ")} insight "${insight.title}".`
  });

  return {
    error
  };
}

export async function runAutomationsForInsights(
  supabase: AppSupabaseClient,
  gymId: string,
  insights: InsightRow[],
  options: AutomationRunOptions = {}
) {
  const maxInsights =
    typeof options.maxInsights === "number" && options.maxInsights >= 0
      ? Math.floor(options.maxInsights)
      : insights.length;
  const insightsToProcess = insights.slice(0, maxInsights);
  const skippedByLimit = Math.max(0, insights.length - insightsToProcess.length);

  logOpsEvent("info", "automation-run-start", {
    gymId,
    insightCount: insights.length,
    inlineInsightCount: insightsToProcess.length,
    skippedByLimit
  });

  if (insightsToProcess.length === 0) {
    return {
      error: null,
      executed: 0,
      skippedByLimit
    };
  }

  const { error: seedError } = await ensureStarterAutomationsForGym(supabase, gymId);

  if (seedError) {
    logOpsEvent("error", "automation-seed-failed", {
      gymId,
      ...serializeError(seedError)
    });
      return {
        error: seedError,
        executed: 0,
        skippedByLimit
      };
  }

  const { data: automations, error } = await supabase
    .from("automations")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true);

  if (error) {
    logOpsEvent("error", "automation-load-failed", {
      gymId,
      ...serializeError(error)
    });
    return {
      error,
      executed: 0,
      skippedByLimit
    };
  }

  let executed = 0;
  const activeAutomations = automations ?? [];

  for (const insight of insightsToProcess) {
    const matchingAutomations = activeAutomations.filter((automation) =>
      shouldAutomationRunForInsight(automation, insight)
    );

    if (matchingAutomations.length === 0) {
      const skippedResult = await logSkippedInsight(supabase, gymId, insight);

      if (skippedResult.error) {
        logOpsEvent("error", "automation-skip-log-failed", {
          gymId,
          insightId: insight.id,
          ...serializeError(skippedResult.error)
        });
        return {
          error: skippedResult.error,
          executed,
          skippedByLimit
        };
      }

      continue;
    }

    for (const automation of matchingAutomations) {
      const result = await executeAutomationForInsight(supabase, automation, insight);

      if (result.error) {
        logOpsEvent("error", "automation-execute-failed", {
          gymId,
          automationId: automation.id,
          insightId: insight.id,
          ...serializeError(result.error)
        });
        return {
          error: result.error,
          executed,
          skippedByLimit
        };
      }

      const notificationResult = await maybeSendAutomationNotification(
        supabase,
        automation,
        insight
      );

      if (notificationResult.error) {
        const { error: logError } = await supabase.from("automation_logs").insert({
          gym_id: gymId,
          automation_id: automation.id,
          member_id: insight.member_id,
          insight_id: insight.id,
          result: "success",
          message: `Automation ran, but notification delivery failed for "${insight.title}".`
        });

        if (logError) {
          return {
            error: logError,
            executed,
            skippedByLimit
          };
        }
      } else if (notificationResult.sent) {
        const { error: logError } = await supabase.from("automation_logs").insert({
          gym_id: gymId,
          automation_id: automation.id,
          member_id: insight.member_id,
          insight_id: insight.id,
          result: "success",
          message: `Notification queued for member after "${insight.title}".`
        });

        if (logError) {
          return {
            error: logError,
            executed
          };
        }
      }

      executed += 1;
    }
  }

  return {
    error: null,
    executed,
    skippedByLimit
  };
}
