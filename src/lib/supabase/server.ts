import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertEnv, env } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  assertEnv(
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    "Supabase"
  );

  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Middleware owns cookie refresh when mutation is unavailable here.
        }
      }
    }
  });
}
