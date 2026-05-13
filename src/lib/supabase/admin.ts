import { createClient } from "@supabase/supabase-js";
import { assertEnv, env } from "@/lib/env";
import type { Database } from "@/types/database";

export function createSupabaseAdminClient() {
  assertEnv(
    ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    "Supabase admin"
  );

  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
