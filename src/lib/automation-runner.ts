import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureStarterAutomationsForGym,
  shouldAutomationRunForInsight
} from "@/lib/automations";
import {
  createAndSendMemberNotification,
  mapInsightTypeToNotificationType
} from "@/lib/notifications";
import type { Database } from "@/types/database";

type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type InsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];

async function executeAutomationForInsight(
  supabase: SupabaseClient<Database>,
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
  supabase: SupabaseClient<Database>,
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
  supabase: SupabaseClient<Database>,
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
  supabase: SupabaseClient<Database>,
  gymId: string,
  insights: InsightRow[]
) {
  if (insights.length === 0) {
    return {
      error: null,
      executed: 0
    };
  }

  const { error: seedError } = await ensureStarterAutomationsForGym(supabase, gymId);

  if (seedError) {
    return {
      error: seedError,
      executed: 0
    };
  }

  const { data: automations, error } = await supabase
    .from("automations")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true);

  if (error) {
    return {
      error,
      executed: 0
    };
  }

  let executed = 0;
  const activeAutomations = automations ?? [];

  for (const insight of insights) {
    const matchingAutomations = activeAutomations.filter((automation) =>
      shouldAutomationRunForInsight(automation, insight)
    );

    if (matchingAutomations.length === 0) {
      const skippedResult = await logSkippedInsight(supabase, gymId, insight);

      if (skippedResult.error) {
        return {
          error: skippedResult.error,
          executed
        };
      }

      continue;
    }

    for (const automation of matchingAutomations) {
      const result = await executeAutomationForInsight(supabase, automation, insight);

      if (result.error) {
        return {
          error: result.error,
          executed
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
            executed
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
    executed
  };
}
