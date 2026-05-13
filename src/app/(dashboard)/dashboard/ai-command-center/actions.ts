"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recalculateGymInsights } from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function aiCommandCenterMessage(message: string) {
  return `/dashboard/ai-command-center?message=${encodeURIComponent(message)}`;
}

export async function runMemberScoringAction() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const result = await recalculateGymInsights(
    supabase,
    currentGym.data.membership.gymId
  );

  if (result.error) {
    redirect(aiCommandCenterMessage(result.error.message));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");
  redirect(
    aiCommandCenterMessage(
      `Analysis complete. Processed ${result.processedMembers} members and opened ${result.createdInsights} insight${result.createdInsights === 1 ? "" : "s"}.`
    )
  );
}

export async function dismissInsightAction(formData: FormData) {
  const insightId = String(formData.get("insightId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!insightId) {
    redirect(aiCommandCenterMessage("Insight not found."));
  }

  const { error } = await supabase
    .from("ai_insights")
    .update({
      status: "dismissed"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", insightId);

  if (error) {
    redirect(aiCommandCenterMessage(error.message));
  }

  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");
  redirect(aiCommandCenterMessage("Insight dismissed."));
}
