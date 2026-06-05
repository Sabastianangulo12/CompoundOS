import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function memberSignupDefaultsTag(gymId: string) {
  return `member-signup-defaults:${gymId}`;
}

export function membershipPlansTag(gymId: string) {
  return `membership-plans:${gymId}`;
}

export async function getCachedMemberSignupDefaults(gymId: string) {
  return unstable_cache(
    async () => {
      const supabase = createSupabaseAdminClient();

      return supabase
        .from("gyms")
        .select("default_waiver_title, default_waiver_body, require_waiver_on_signup")
        .eq("id", gymId)
        .single();
    },
    ["member-signup-defaults", gymId],
    {
      revalidate: 300,
      tags: [memberSignupDefaultsTag(gymId)]
    }
  )();
}

export async function getCachedMembershipPlans(gymId: string) {
  return unstable_cache(
    async () => {
      const supabase = createSupabaseAdminClient();

      return supabase
        .from("membership_plans")
        .select("id, name, price_cents, billing_interval")
        .eq("gym_id", gymId)
        .eq("is_active", true)
        .order("price_cents", { ascending: true });
    },
    ["membership-plans", gymId],
    {
      revalidate: 300,
      tags: [membershipPlansTag(gymId)]
    }
  )();
}
