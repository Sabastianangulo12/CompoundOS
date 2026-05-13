import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type CheckInRow = Database["public"]["Tables"]["check_ins"]["Row"];

export type CheckInWithMember = CheckInRow & {
  members: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
};

export function filterMembersBySearch<
  T extends {
    first_name: string;
    last_name: string;
    email: string | null;
  }
>(members: T[], search: string) {
  const normalized = search.trim().toLowerCase();

  if (!normalized) {
    return members;
  }

  return members.filter((member) => {
    const haystack = [
      member.first_name,
      member.last_name,
      member.email ?? ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function isDateInTimeZone(dateIso: string, timeZone: string, target: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date(dateIso)) === formatter.format(target);
}

export function countTodayCheckIns(checkIns: CheckInRow[], timeZone: string) {
  const now = new Date();
  return checkIns.filter((checkIn) =>
    isDateInTimeZone(checkIn.created_at, timeZone, now)
  ).length;
}

export async function getRecentCheckInsForGym(
  supabase: SupabaseClient<Database>,
  gymId: string,
  limit = 25
) {
  const { data, error } = await supabase
    .from("check_ins")
    .select(
      `
        id,
        gym_id,
        member_id,
        check_in_method,
        created_at,
        members (
          id,
          first_name,
          last_name,
          email
        )
      `
    )
    .eq("gym_id", gymId)
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  return {
    data: (data ?? []) as CheckInWithMember[],
    error
  };
}
