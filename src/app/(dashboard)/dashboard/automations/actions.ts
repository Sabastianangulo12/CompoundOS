"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function automationsMessage(message: string) {
  return `/dashboard/automations?message=${encodeURIComponent(message)}`;
}

export async function toggleAutomationAction(formData: FormData) {
  const automationId = String(formData.get("automationId") ?? "").trim();
  const nextValue = String(formData.get("nextValue") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!automationId) {
    redirect(automationsMessage("Automation not found."));
  }

  const isActive = nextValue === "true";

  const { error } = await supabase
    .from("automations")
    .update({
      is_active: isActive
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", automationId);

  if (error) {
    redirect(automationsMessage(error.message));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");
  redirect(automationsMessage(isActive ? "Automation activated." : "Automation paused."));
}
