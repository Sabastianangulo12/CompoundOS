import { supabase } from "./supabase";

export type GymAnnouncementRecord = {
  id: string;
  gym_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchGymAnnouncements(gymId: string, limit = 6) {
  const result = await supabase
    .from("gym_announcements")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .order("is_pinned", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  return {
    data: (result.data ?? []) as GymAnnouncementRecord[],
    error: result.error
  };
}
