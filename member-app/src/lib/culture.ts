import { supabase } from "./supabase";

export type GymChallengeRecord = {
  id: string;
  title: string;
  description: string | null;
  metric_type: "steps" | "visits" | "workouts";
  goal_value: number;
  period: "weekly" | "monthly";
  starts_on: string;
  ends_on: string;
  status: "active" | "archived";
};

export type GymShoutoutRecord = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  members: Array<{
    id: string;
    first_name: string;
    last_name: string;
  }> | null;
};

export type GymMemberSpotlightRecord = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  status: "active" | "archived";
  created_at: string;
  members: Array<{
    id: string;
    first_name: string;
    last_name: string;
  }> | null;
};

export async function fetchActiveChallenges(gymId: string) {
  const result = await supabase
    .from("gym_challenges")
    .select("*")
    .eq("gym_id", gymId)
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(6);

  return {
    data: (result.data ?? []) as GymChallengeRecord[],
    error: result.error
  };
}

export async function fetchRecentShoutouts(gymId: string) {
  const now = new Date().toISOString();
  const result = await supabase
    .from("gym_shoutouts")
    .select(
      `
        id,
        title,
        body,
        is_pinned,
        expires_at,
        created_at,
        members (
          id,
          first_name,
          last_name
        )
      `
    )
    .eq("gym_id", gymId)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);

  return {
    data: (result.data ?? []) as GymShoutoutRecord[],
    error: result.error
  };
}

export async function fetchActiveSpotlights(gymId: string) {
  const result = await supabase
    .from("gym_member_spotlights")
    .select(
      `
        id,
        title,
        body,
        image_url,
        status,
        created_at,
        members (
          id,
          first_name,
          last_name
        )
      `
    )
    .eq("gym_id", gymId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(3);

  return {
    data: (result.data ?? []) as GymMemberSpotlightRecord[],
    error: result.error
  };
}
