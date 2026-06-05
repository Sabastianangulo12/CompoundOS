import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database, GymAnnouncement } from "@/types/database";

export async function getGymAnnouncements(
  supabase: AppSupabaseClient,
  gymId: string,
  limit = 12
) {
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
    data: (result.data ?? []) as GymAnnouncement[],
    error: result.error
  };
}
