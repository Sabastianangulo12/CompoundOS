"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatInsightRunMessage, recalculateGymInsights } from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function aiCommandCenterMessage(message: string) {
  return `/dashboard/ai-command-center?message=${encodeURIComponent(message)}`;
}

export async function runMemberScoringFastAction() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return {
      ok: false,
      message: currentGym.error?.message ?? buildGymAccessMessage()
    };
  }

  const result = await recalculateGymInsights(supabase, currentGym.data.membership.gymId);

  if (result.error) {
    return {
      ok: false,
      message: result.error.message
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");

  return {
    ok: true,
    message: formatInsightRunMessage(result)
  };
}

export async function dismissInsightFastAction(insightId: string) {
  const normalizedInsightId = insightId.trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return {
      ok: false,
      message: currentGym.error?.message ?? buildGymAccessMessage()
    };
  }

  if (!normalizedInsightId) {
    return {
      ok: false,
      message: "Insight not found."
    };
  }

  const { error } = await supabase
    .from("ai_insights")
    .update({
      status: "dismissed"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", normalizedInsightId);

  if (error) {
    return {
      ok: false,
      message: error.message
    };
  }

  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");

  return {
    ok: true,
    message: "Insight dismissed."
  };
}

export async function runMemberScoringAction() {
  const result = await runMemberScoringFastAction();
  redirect(aiCommandCenterMessage(result.message));
}

export async function dismissInsightAction(formData: FormData) {
  const insightId = String(formData.get("insightId") ?? "").trim();
  const result = await dismissInsightFastAction(insightId);
  redirect(aiCommandCenterMessage(result.message));
}
