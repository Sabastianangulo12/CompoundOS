import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { cookies } from "next/headers";
import { assertEnv, env } from "@/lib/env";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

export const createSupabaseServerClient = cache(
  async (): Promise<AppSupabaseClient> => {
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
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options: Record<string, unknown>;
        }>
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as any);
          });
        } catch {
          // Middleware owns cookie refresh when mutation is unavailable here.
        }
      }
    }
  }) as AppSupabaseClient;
});
