import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type InsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];

export const automationTriggerLabels: Record<AutomationRow["trigger_type"], string> = {
  insight_created: "Insight created",
  member_inactive: "Member inactive",
  payment_failed: "Payment failed"
};

export const automationActionLabels: Record<AutomationRow["action_type"], string> = {
  create_insight: "Create insight",
  log_action: "Log action"
};

export const starterAutomations: Array<Database["public"]["Tables"]["automations"]["Insert"]> = [
  {
    name: "Follow up on retention risk",
    trigger_type: "insight_created",
    insight_type: "retention_risk",
    action_type: "log_action",
    is_active: true,
    gym_id: ""
  },
  {
    name: "Retry failed payment",
    trigger_type: "insight_created",
    insight_type: "failed_payment",
    action_type: "log_action",
    is_active: true,
    gym_id: ""
  },
  {
    name: "Send upsell offer",
    trigger_type: "insight_created",
    insight_type: "upsell_opportunity",
    action_type: "log_action",
    is_active: true,
    gym_id: ""
  }
];

export async function ensureStarterAutomationsForGym(
  supabase: AppSupabaseClient,
  gymId: string
) {
  const payload = starterAutomations.map((automation) => ({
    ...automation,
    gym_id: gymId
  }));

  return supabase.from("automations").upsert(payload, {
    onConflict: "gym_id,name",
    ignoreDuplicates: true
  });
}

export function shouldAutomationRunForInsight(
  automation: AutomationRow,
  insight: InsightRow
) {
  if (!automation.is_active) {
    return false;
  }

  if (automation.trigger_type !== "insight_created") {
    return false;
  }

  if (automation.insight_type && automation.insight_type !== insight.type) {
    return false;
  }

  return true;
}
