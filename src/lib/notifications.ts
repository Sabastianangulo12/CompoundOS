import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

type InsightType = Database["public"]["Tables"]["ai_insights"]["Row"]["type"];
type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];

export type NotificationWithMember = Database["public"]["Tables"]["notifications"]["Row"] & {
  members: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

export function mapInsightTypeToNotificationType(
  insightType: InsightType
): NotificationType {
  if (
    ["retention_risk", "inactivity", "attendance_drop"].includes(insightType)
  ) {
    return "retention";
  }

  if (
    ["failed_payment", "missing_subscription", "revenue_leak"].includes(insightType)
  ) {
    return "billing";
  }

  if (insightType === "upsell_opportunity") {
    return "general";
  }

  return "general";
}

export async function createAndSendMemberNotification(
  supabase: SupabaseClient<Database>,
  input: {
    gymId: string;
    memberId: string;
    title: string;
    body: string;
    type: NotificationType;
  }
) {
  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .insert({
      gym_id: input.gymId,
      member_id: input.memberId,
      title: input.title,
      body: input.body,
      type: input.type,
      status: "pending"
    })
    .select("*")
    .single();

  if (notificationError || !notification) {
    return {
      error: notificationError ?? new Error("Notification could not be created."),
      data: null
    };
  }

  const { data: tokenRows, error: tokenError } = await supabase
    .from("member_push_tokens")
    .select("id, push_token, platform")
    .eq("gym_id", input.gymId)
    .eq("member_id", input.memberId)
    .order("updated_at", {
      ascending: false
    });

  if (tokenError) {
    await supabase
      .from("notifications")
      .update({
        status: "failed"
      })
      .eq("id", notification.id)
      .eq("gym_id", input.gymId);

    return {
      error: tokenError,
      data: notification
    };
  }

  const expoTokens = (tokenRows ?? [])
    .filter((tokenRow) => tokenRow.platform === "expo")
    .map((tokenRow) => tokenRow.push_token);

  if (expoTokens.length === 0) {
    await supabase
      .from("notifications")
      .update({
        status: "failed"
      })
      .eq("id", notification.id)
      .eq("gym_id", input.gymId);

    return {
      error: null,
      data: notification,
      sent: false
    };
  }

  const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
      ...(env.expoPushAccessToken
        ? {
            Authorization: `Bearer ${env.expoPushAccessToken}`
          }
        : {})
    },
    body: JSON.stringify(
      expoTokens.map((to) => ({
        to,
        title: input.title,
        body: input.body,
        sound: "default",
        data: {
          memberId: input.memberId,
          gymId: input.gymId,
          notificationId: notification.id,
          type: input.type
        }
      }))
    )
  }).catch((error) => ({
    ok: false,
    status: 500,
    json: async () => ({
      errors: [
        {
          message: error instanceof Error ? error.message : "Push request failed"
        }
      ]
    })
  }));

  const payload = (await pushResponse.json()) as {
    data?: Array<{
      status: "ok" | "error";
    }>;
    errors?: Array<{
      message?: string;
    }>;
  };

  const wasSent =
    pushResponse.ok &&
    (payload.data ?? []).some((item) => item.status === "ok");

  const { error: updateError } = await supabase
    .from("notifications")
    .update({
      status: wasSent ? "sent" : "failed"
    })
    .eq("id", notification.id)
    .eq("gym_id", input.gymId);

  return {
    error:
      updateError ??
      (!wasSent
        ? new Error(payload.errors?.[0]?.message ?? "Push notification failed")
        : null),
    data: notification,
    sent: wasSent
  };
}
