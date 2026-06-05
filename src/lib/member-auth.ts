import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, hasSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function getAuthenticatedMemberFromToken(token: string) {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const anonClient = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  const {
    data: { user },
    error: userError
  } = await anonClient.auth.getUser(token);

  if (userError || !user) {
    throw new Error(userError?.message ?? "Unauthorized.");
  }

  const admin = createSupabaseAdminClient();
  const { data: members, error: memberError } = await admin
    .from("members")
    .select("id, gym_id, user_id, first_name, last_name, email, phone, stripe_customer_id, stripe_default_payment_method_id, status, frozen_until, canceled_at, joined_at, created_at, updated_at")
    .eq("user_id", user.id)
    .neq("status", "canceled")
    .order("updated_at", {
      ascending: false
    })
    .limit(2);

  if (memberError || !members?.length) {
    throw new Error(memberError?.message ?? "Member profile not found.");
  }

  if (members.length > 1) {
    throw new Error(
      "Multiple active member profiles are linked to this account. Please contact staff so they can help you choose the correct gym profile."
    );
  }

  const member = members[0];

  return {
    admin,
    user,
    member: member as Database["public"]["Tables"]["members"]["Row"]
  };
}
