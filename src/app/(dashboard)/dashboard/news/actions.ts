"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendNotificationToGymMembers } from "@/lib/notifications";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function newsMessage(message: string) {
  return `/dashboard/news?message=${encodeURIComponent(message)}`;
}

export async function createAnnouncementAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const isPinned = String(formData.get("isPinned") ?? "") === "on";
  const notifyMembers = String(formData.get("notifyMembers") ?? "") === "on";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!title || !body) {
    redirect(newsMessage("Add a title and message before posting."));
  }

  const { error } = await supabase.from("gym_announcements").insert({
    gym_id: currentGym.data.membership.gymId,
    title,
    body,
    is_pinned: isPinned
  });

  if (error) {
    redirect(newsMessage(error.message));
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
        newsMessage(
          `Announcement posted, but some notifications failed. ${result.sent} sent, ${result.failed} failed.`
        )
      );
    }
  }

  revalidatePath("/dashboard/news");
  redirect(newsMessage("Announcement posted."));
}

export async function updateAnnouncementAction(formData: FormData) {
  const announcementId = String(formData.get("announcementId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!announcementId) {
    redirect(newsMessage("Announcement not found."));
  }

  if (intent === "archive") {
    const { error } = await supabase
      .from("gym_announcements")
      .update({
        is_active: false
      })
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("id", announcementId);

    if (error) {
      redirect(newsMessage(error.message));
    }

    revalidatePath("/dashboard/news");
    redirect(newsMessage("Announcement archived."));
  }

  const nextPinned = intent === "pin";

  const { error } = await supabase
    .from("gym_announcements")
    .update({
      is_pinned: nextPinned
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", announcementId);

  if (error) {
    redirect(newsMessage(error.message));
  }

  revalidatePath("/dashboard/news");
  redirect(newsMessage(nextPinned ? "Announcement pinned." : "Announcement unpinned."));
}
