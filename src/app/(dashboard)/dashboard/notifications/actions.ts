"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAndSendMemberNotification } from "@/lib/notifications";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function notificationsMessage(message: string) {
  return `/dashboard/notifications?message=${encodeURIComponent(message)}`;
}

export async function sendMemberNotificationAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const recipient = String(formData.get("recipient") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const type = String(formData.get("type") ?? "general").trim();
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
    redirect(buildMessagePath(redirectTo, "Add both a title and message before sending."));
  }

  if (!["retention", "workout", "billing", "general"].includes(type)) {
    redirect(buildMessagePath(redirectTo, "Notification type is invalid."));
  }

  let recipients: Array<{
    id: string;
  }> = [];

  if (recipient === "all_active") {
    const { data, error } = await supabase
      .from("members")
      .select("id")
      .eq("gym_id", currentGym.data.membership.gymId)
      .neq("status", "canceled");

    if (error) {
      redirect(buildMessagePath(redirectTo, error.message));
    }

    recipients = data ?? [];
  } else {
    const { data, error } = await supabase
      .from("members")
      .select("id")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("id", recipient)
      .neq("status", "canceled")
      .maybeSingle();

    if (error) {
      redirect(buildMessagePath(redirectTo, error.message));
    }

    if (!data) {
      redirect(buildMessagePath(redirectTo, "Recipient was not found for this gym."));
    }

    recipients = [data];
  }

  if (recipients.length === 0) {
    redirect(buildMessagePath(redirectTo, "No eligible members were found for this send."));
  }

  let created = 0;
  let sent = 0;
  let failed = 0;

  for (const target of recipients) {
    const result = await createAndSendMemberNotification(supabase, {
      gymId: currentGym.data.membership.gymId,
      memberId: target.id,
      title,
      body,
      type: type as "retention" | "workout" | "billing" | "general"
    });

    if (result.data) {
      created += 1;
    }

    if (result.sent) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  if (redirectTo) {
    revalidatePath(redirectTo);
  }
  redirect(
    buildMessagePath(
      redirectTo,
      `Notification processed for ${created} member${created === 1 ? "" : "s"}. ${sent} sent, ${failed} failed.`
    )
  );
}

function buildMessagePath(redirectTo: string, message: string) {
  if (!redirectTo) {
    return notificationsMessage(message);
  }

  const separator = redirectTo.includes("?") ? "&" : "?";
  return `${redirectTo}${separator}message=${encodeURIComponent(message)}`;
}
