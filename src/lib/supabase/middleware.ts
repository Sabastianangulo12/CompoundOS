import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getActiveGymMembership } from "@/lib/gym-users";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.next({
      request
    });
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  if ((isDashboardRoute || isOnboardingRoute) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("message", "Please sign in to access the dashboard.");
    return NextResponse.redirect(url);
  }

  if (!user) {
    return response;
  }

  if (isDashboardRoute || isAuthRoute || isOnboardingRoute) {
    const membership = await getActiveGymMembership(supabase, user.id);

    if (membership.error) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("message", membership.error.message);
      return NextResponse.redirect(url);
    }

    if (isDashboardRoute && !membership.data) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/create-gym";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isOnboardingRoute && membership.data) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = membership.data ? "/dashboard" : "/onboarding/create-gym";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
