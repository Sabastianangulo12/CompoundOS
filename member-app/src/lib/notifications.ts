import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

export type MemberNotification = {
  id: string;
  title: string;
  body: string;
  type: "retention" | "workout" | "billing" | "general";
  status: "pending" | "sent" | "failed";
  created_at: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    return {
      token: null,
      error: null
    };
  }

  if (Device.osName === "Android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermissions.status;

  if (currentPermissions.status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return {
      token: null,
      error: new Error("Notification permission was not granted.")
    };
  }

  const projectId =
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    return {
      token: null,
      error: new Error("Expo project ID is missing for push registration.")
    };
  }

  let pushToken;

  try {
    pushToken = await Notifications.getExpoPushTokenAsync({
      projectId
    });
  } catch (error) {
    return {
      token: null,
      error: new Error(
        error instanceof Error ? error.message : "Push registration failed."
      )
    };
  }

  return {
    token: pushToken.data,
    error: null
  };
}

export async function savePushToken(pushToken: string) {
  return supabase.rpc("register_member_push_token", {
    token_value: pushToken,
    token_platform: "expo"
  });
}

export async function fetchRecentNotifications(limit = 12) {
  const result = await supabase
    .from("notifications")
    .select("id, title, body, type, status, created_at")
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  if (result.error) {
    return {
      data: null,
      error: result.error
    };
  }

  return {
    data: (result.data ?? []) as MemberNotification[],
    error: null
  };
}
