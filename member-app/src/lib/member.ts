import { supabase } from "./supabase";

export type MemberStatus = "active" | "frozen" | "canceled" | "lead";

export type MemberRecord = {
  id: string;
  gym_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  frozen_until: string | null;
  canceled_at: string | null;
  joined_at: string | null;
};

export type GymRecord = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

export type MemberAppContext = {
  member: MemberRecord;
  gym: GymRecord | null;
};

export type MemberStats = {
  totalVisits: number;
  streak: number;
  lastCheckInAt: string | null;
};

export type CheckInRecord = {
  id?: string;
  created_at: string;
  check_in_method: "manual" | "qr";
};

export async function claimCurrentMemberProfile() {
  return supabase.rpc("claim_member_profile");
}

export async function fetchCurrentMemberWithGym(userId: string) {
  const memberResult = await supabase
    .from("members")
    .select(
      `
        id,
        gym_id,
        user_id,
        first_name,
        last_name,
        email,
        phone,
        status,
        frozen_until,
        canceled_at,
        joined_at
      `
    )
    .eq("user_id", userId)
    .neq("status", "canceled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberResult.error) {
    return {
      data: null,
      error: memberResult.error
    };
  }

  if (!memberResult.data) {
    return {
      data: null,
      error: null
    };
  }

  const member = memberResult.data as MemberRecord;
  const gymResult = await supabase
    .from("gyms")
    .select("id, name, slug, timezone")
    .eq("id", member.gym_id)
    .maybeSingle();

  if (gymResult.error) {
    return {
      data: null,
      error: gymResult.error
    };
  }

  return {
    data: {
      member: {
        id: member.id,
        gym_id: member.gym_id,
        user_id: member.user_id,
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        phone: member.phone,
        status: member.status,
        frozen_until: member.frozen_until,
        canceled_at: member.canceled_at,
        joined_at: member.joined_at
      },
      gym: (gymResult.data as GymRecord | null) ?? null
    } satisfies MemberAppContext,
    error: null
  };
}

export async function fetchMemberStats(member: MemberRecord) {
  const [countResult, recentCheckInsResult] = await Promise.all([
    supabase
      .from("check_ins")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("gym_id", member.gym_id)
      .eq("member_id", member.id),
    supabase
      .from("check_ins")
      .select("id, created_at, check_in_method")
      .eq("gym_id", member.gym_id)
      .eq("member_id", member.id)
      .order("created_at", {
        ascending: false
      })
      .limit(180)
  ]);

  if (countResult.error) {
    return {
      data: null,
      error: countResult.error
    };
  }

  if (recentCheckInsResult.error) {
    return {
      data: null,
      error: recentCheckInsResult.error
    };
  }

  const recentCheckIns = (recentCheckInsResult.data ?? []) as CheckInRecord[];

  return {
    data: {
      totalVisits: countResult.count ?? 0,
      streak: calculateVisitStreak(recentCheckIns),
      lastCheckInAt: recentCheckIns[0]?.created_at ?? null
    } satisfies MemberStats,
    error: null
  };
}

export async function fetchRecentCheckIns(member: MemberRecord, limit = 8) {
  const result = await supabase
    .from("check_ins")
    .select("id, created_at, check_in_method")
    .eq("gym_id", member.gym_id)
    .eq("member_id", member.id)
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
    data: (result.data ?? []) as CheckInRecord[],
    error: null
  };
}

export async function createManualCheckIn(member: MemberRecord) {
  return supabase.from("check_ins").insert({
    gym_id: member.gym_id,
    member_id: member.id,
    check_in_method: "manual"
  });
}

function calculateVisitStreak(checkIns: CheckInRecord[]) {
  const uniqueDays = Array.from(
    new Set(
      checkIns.map((checkIn) =>
        new Date(checkIn.created_at).toISOString().slice(0, 10)
      )
    )
  );

  if (uniqueDays.length === 0) {
    return 0;
  }

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = 0; index < uniqueDays.length; index += 1) {
    const comparison = new Date(today);
    comparison.setDate(today.getDate() - index);

    if (uniqueDays[index] !== comparison.toISOString().slice(0, 10)) {
      if (index === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (uniqueDays[0] !== yesterday.toISOString().slice(0, 10)) {
          return 0;
        }

        streak += 1;
        continue;
      }

      break;
    }

    streak += 1;
  }

  return streak;
}
