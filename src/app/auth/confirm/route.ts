import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { upsertProfileForUser } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = getSafeNextPath(searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(withMessageUrl(origin, "/login", "Invalid confirmation link."));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (error) {
    return NextResponse.redirect(withMessageUrl(origin, "/login", error.message));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { error: profileError } = await upsertProfileForUser(supabase, user);

    if (profileError) {
      return NextResponse.redirect(
        withMessageUrl(origin, "/login", profileError.message)
      );
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}

function withMessageUrl(origin: string, pathname: string, message: string) {
  const url = new URL(pathname, origin);
  url.searchParams.set("message", message);
  return url;
}

function getSafeNextPath(next: string | null) {
  if (next && next.startsWith("/")) {
    return next;
  }

  return "/dashboard";
}
