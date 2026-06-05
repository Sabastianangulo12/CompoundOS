import type { User } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/types";

export async function upsertProfileForUser(
  supabase: AppSupabaseClient,
  user: User
) {
  const fullName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : null;
  const gymName =
    typeof user.user_metadata.gym_name === "string"
      ? user.user_metadata.gym_name
      : null;

  return supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      full_name: fullName,
      gym_name: gymName,
      role: "owner"
    },
    {
      onConflict: "id"
    }
  );
}
