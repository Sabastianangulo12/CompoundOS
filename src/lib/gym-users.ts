import { cache } from "react";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

export type ActiveGymMembership = {
  gymId: string;
  gymName: string;
  gymSlug: string;
  gymTimezone: string;
  role: Database["public"]["Tables"]["gym_users"]["Row"]["role"];
};

type GymUserWithGym = {
  gym_id: string;
  role: Database["public"]["Tables"]["gym_users"]["Row"]["role"];
  gyms: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  } | null;
};

export const getActiveGymMembership = cache(async (
  supabase: AppSupabaseClient,
  userId: string
) => {
  const { data, error } = await supabase
    .from("gym_users")
    .select(
      `
        gym_id,
        role,
        gyms (
          id,
          name,
          slug,
          timezone
        )
      `
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  const membershipData = data as GymUserWithGym | null;

  if (error) {
    return {
      data: null,
      error
    };
  }

  if (!membershipData?.gyms) {
    return {
      data: null,
      error: null
    };
  }

  return {
    data: {
      gymId: membershipData.gym_id,
      gymName: membershipData.gyms.name,
      gymSlug: membershipData.gyms.slug,
      gymTimezone: membershipData.gyms.timezone,
      role: membershipData.role
    } satisfies ActiveGymMembership,
    error: null
  };
});

export const getCurrentGymContext = cache(async (
  supabase: AppSupabaseClient
) => {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      data: null,
      error: userError
    };
  }

  if (!user) {
    return {
      data: null,
      error: null
    };
  }

  const membership = await getActiveGymMembership(supabase, user.id);

  if (membership.error || !membership.data) {
    return {
      data: null,
      error: membership.error
    };
  }

  return {
    data: {
      user,
      membership: membership.data
    },
    error: null
  };
});

export function buildGymAccessMessage() {
  return "Create or join a gym before accessing gym data.";
}
