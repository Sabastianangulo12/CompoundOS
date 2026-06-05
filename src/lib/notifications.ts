import { env } from "@/lib/env";
import {
  isTransientRemoteError,
  logOpsEvent,
  serializeError,
  withRetries
} from "@/lib/observability";
import type { AppSupabaseClient } from "@/lib/supabase/types";
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

type NotificationSendResult = {
  error: Error | null | unknown;
  data: Database["public"]["Tables"]["notifications"]["Row"] | null;
  sent: boolean;
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
  supabase: AppSupabaseClient,
  input: {
    gymId: string;
    memberId: string;
    title: string;
    body: string;
    type: NotificationType;
  }
): Promise<NotificationSendResult> {
  logOpsEvent("info", "notification-create-start", {
    gymId: input.gymId,
    memberId: input.memberId,
    type: input.type
  });

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
    logOpsEvent("error", "notification-create-failed", {
      gymId: input.gymId,
      memberId: input.memberId,
      type: input.type,
      ...serializeError(notificationError)
    });

    return {
      error: notificationError ?? new Error("Notification could not be created."),
      data: null,
      sent: false
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

    logOpsEvent("error", "notification-token-query-failed", {
      gymId: input.gymId,
      memberId: input.memberId,
      notificationId: notification.id,
      ...serializeError(tokenError)
    });

    return {
      error: tokenError,
      data: notification,
      sent: false
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

    logOpsEvent("warn", "notification-no-push-tokens", {
      gymId: input.gymId,
      memberId: input.memberId,
      notificationId: notification.id
    });

    return {
      error: null,
      data: notification,
      sent: false
    };
  }

  const pushResponse = await withRetries(
    "expo-push-send",
    () =>
      fetch("https://exp.host/--/api/v2/push/send", {
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
      }),
    {
      retries: 3,
      delayMs: 500,
      shouldRetry: isTransientRemoteError,
      context: {
        gymId: input.gymId,
        memberId: input.memberId,
        notificationId: notification.id
      }
    }
  ).catch((error) => ({
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

  const result = {
    error:
      updateError ??
      (!wasSent
        ? new Error(payload.errors?.[0]?.message ?? "Push notification failed")
        : null),
    data: notification,
    sent: wasSent
  };

  logOpsEvent(result.error ? "error" : "info", "notification-send-finished", {
    gymId: input.gymId,
    memberId: input.memberId,
    notificationId: notification.id,
    sent: wasSent,
    status: wasSent ? "sent" : "failed",
    ...(result.error ? serializeError(result.error) : {})
  });

  return result;
}

export async function sendNotificationToGymMembers(
  supabase: AppSupabaseClient,
  input: {
    gymId: string;
    title: string;
    body: string;
    type: NotificationType;
    memberIds?: string[];
  }
) {
  let memberIds = input.memberIds ?? [];

  if (memberIds.length === 0) {
    const membersResult = await supabase
      .from("members")
      .select("id")
      .eq("gym_id", input.gymId)
      .neq("status", "canceled");

    if (membersResult.error) {
      return {
        error: membersResult.error,
        created: 0,
        sent: 0,
        failed: 0
      };
    }

    memberIds = (membersResult.data ?? []).map((member) => member.id);
  }

  let created = 0;
  let sent = 0;
  let failed = 0;
  let lastError: Error | null = null;

  for (const memberId of memberIds) {
    const result = await createAndSendMemberNotification(supabase, {
      gymId: input.gymId,
      memberId,
      title: input.title,
      body: input.body,
      type: input.type
    });

    if (result.data) {
      created += 1;
    }

    if (result.sent) {
      sent += 1;
    } else {
      failed += 1;
    }

    if (result.error && !lastError) {
      lastError = result.error instanceof Error ? result.error : new Error(String(result.error));
    }
  }

  return {
    error: lastError,
    created,
    sent,
    failed
  };
}
