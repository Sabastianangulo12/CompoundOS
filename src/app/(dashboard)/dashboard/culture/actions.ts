"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendNotificationToGymMembers } from "@/lib/notifications";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function cultureMessage(message: string) {
  return `/dashboard/culture?message=${encodeURIComponent(message)}`;
}

export async function createShoutoutAction(formData: FormData) {
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
  const body = String(formData.get("body") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const isPinned = String(formData.get("isPinned") ?? "") === "on";
  const notifyMembers = String(formData.get("notifyMembers") ?? "") === "on";
  const expiresAtValue = String(formData.get("expiresAt") ?? "").trim();

  if (!title || !body) {
    redirect(cultureMessage("Shoutout title and body are required."));
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(cultureMessage(authError?.message ?? "User not found."));
  }

  const { error } = await supabase.from("gym_shoutouts").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId || null,
    title,
    body,
    created_by_user_id: user.id,
    is_pinned: isPinned,
    expires_at: expiresAtValue ? new Date(expiresAtValue).toISOString() : null
  });

  if (error) {
    redirect(cultureMessage(error.message));
  }

  if (notifyMembers) {
    const result = await sendNotificationToGymMembers(supabase, {
      gymId: currentGym.data.membership.gymId,
      title,
      body,
      type: "general"
    });

    if (result.error) {
      redirect(
        cultureMessage(
          `Shoutout posted, but some notifications failed. ${result.sent} sent, ${result.failed} failed.`
        )
      );
    }
  }

  revalidatePath("/dashboard/culture");
  redirect(cultureMessage("Shoutout posted."));
}

export async function createSpotlightAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const notifyMember = String(formData.get("notifyMember") ?? "") === "on";

  if (!memberId || !title || !body) {
    redirect(cultureMessage("Spotlight member, title, and body are required."));
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(cultureMessage(authError?.message ?? "User not found."));
  }

  const { error } = await supabase.from("gym_member_spotlights").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    title,
    body,
    image_url: imageUrl || null,
    created_by_user_id: user.id
  });

  if (error) {
    redirect(cultureMessage(error.message));
  }

  if (notifyMember) {
    const result = await sendNotificationToGymMembers(supabase, {
      gymId: currentGym.data.membership.gymId,
      title,
      body,
      type: "general",
      memberIds: [memberId]
    });

    if (result.error) {
      redirect(
        cultureMessage(
          `Spotlight created, but the member notification failed. ${result.sent} sent, ${result.failed} failed.`
        )
      );
    }
  }

  revalidatePath("/dashboard/culture");
  redirect(cultureMessage("Member spotlight created."));
}

export async function archiveSpotlightAction(formData: FormData) {
  const spotlightId = String(formData.get("spotlightId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!spotlightId) {
    redirect(cultureMessage("Spotlight not found."));
  }

  const { error } = await supabase
    .from("gym_member_spotlights")
    .update({ status: "archived" })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", spotlightId);

  if (error) {
    redirect(cultureMessage(error.message));
  }

  revalidatePath("/dashboard/culture");
  redirect(cultureMessage("Spotlight archived."));
}

export async function toggleShoutoutPinAction(formData: FormData) {
  const shoutoutId = String(formData.get("shoutoutId") ?? "").trim();
  const nextPinned = String(formData.get("nextPinned") ?? "").trim() === "true";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!shoutoutId) {
    redirect(cultureMessage("Shoutout not found."));
  }

  const { error } = await supabase
    .from("gym_shoutouts")
    .update({ is_pinned: nextPinned })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", shoutoutId);

  if (error) {
    redirect(cultureMessage(error.message));
  }

  revalidatePath("/dashboard/culture");
  redirect(cultureMessage(nextPinned ? "Shoutout pinned." : "Shoutout unpinned."));
}

export async function archiveShoutoutAction(formData: FormData) {
  const shoutoutId = String(formData.get("shoutoutId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!shoutoutId) {
    redirect(cultureMessage("Shoutout not found."));
  }

  const { error } = await supabase
    .from("gym_shoutouts")
    .update({ expires_at: new Date().toISOString() })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", shoutoutId);

  if (error) {
    redirect(cultureMessage(error.message));
  }

  revalidatePath("/dashboard/culture");
  redirect(cultureMessage("Shoutout archived."));
}
