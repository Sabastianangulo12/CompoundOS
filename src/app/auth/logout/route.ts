import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  url.searchParams.set("message", "You have been signed out.");

  return NextResponse.redirect(url, {
    status: 303
  });
}

