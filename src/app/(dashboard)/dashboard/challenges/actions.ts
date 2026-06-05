"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function challengeMessage(message: string) {
  return `/dashboard/challenges?message=${encodeURIComponent(message)}`;
}

export async function createChallengeAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const metricType = String(formData.get("metricType") ?? "").trim();
  const goalValue = Number(formData.get("goalValue") ?? 0);
  const period = String(formData.get("period") ?? "").trim();
  const startsOn = String(formData.get("startsOn") ?? "").trim();
  const endsOn = String(formData.get("endsOn") ?? "").trim();

  if (!title || !startsOn || !endsOn || goalValue <= 0) {
    redirect(challengeMessage("Title, goal, and date range are required."));
  }

  if (!["steps", "visits", "workouts"].includes(metricType)) {
    redirect(challengeMessage("Challenge metric is invalid."));
  }

  if (!["weekly", "monthly"].includes(period)) {
    redirect(challengeMessage("Challenge period is invalid."));
  }

  const { error } = await supabase.from("gym_challenges").insert({
    gym_id: currentGym.data.membership.gymId,
    title,
    description: description || null,
    metric_type: metricType as "steps" | "visits" | "workouts",
    goal_value: goalValue,
    period: period as "weekly" | "monthly",
    starts_on: startsOn,
    ends_on: endsOn
  });

  if (error) {
    redirect(challengeMessage(error.message));
  }

  revalidatePath("/dashboard/challenges");
  redirect(challengeMessage("Challenge created."));
}

export async function archiveChallengeAction(formData: FormData) {
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!challengeId) {
    redirect(challengeMessage("Challenge not found."));
  }

  const { error } = await supabase
    .from("gym_challenges")
    .update({ status: "archived" })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", challengeId);

  if (error) {
    redirect(challengeMessage(error.message));
  }

  revalidatePath("/dashboard/challenges");
  redirect(challengeMessage("Challenge archived."));
}

export async function activateChallengeAction(formData: FormData) {
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!challengeId) {
    redirect(challengeMessage("Challenge not found."));
  }

  const { error } = await supabase
    .from("gym_challenges")
    .update({ status: "active" })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", challengeId);

  if (error) {
    redirect(challengeMessage(error.message));
  }

  revalidatePath("/dashboard/challenges");
  redirect(challengeMessage("Challenge reactivated."));
}
