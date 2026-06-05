import { NextRequest, NextResponse } from "next/server";
import { syncMemberCardSetupSession } from "@/lib/member-billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!sessionId) {
    return NextResponse.redirect(
      new URL(
        `/billing/card-canceled?message=${encodeURIComponent("Stripe card setup session was missing.")}`,
        appUrl
      )
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await syncMemberCardSetupSession(admin, {
      sessionId
    });

    return NextResponse.redirect(new URL("/billing/card-updated", appUrl));
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/billing/card-canceled?message=${encodeURIComponent(
          error instanceof Error ? error.message : "Card setup could not be completed."
        )}`,
        appUrl
      )
    );
  }
}
