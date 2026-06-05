import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncStripeCheckoutSession } from "@/lib/stripe-sync";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!sessionId) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent("Stripe checkout session was missing.")}`,
        appUrl
      )
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await syncStripeCheckoutSession(admin, sessionId);

    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent("Stripe checkout completed and synced.")}`,
        appUrl
      )
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent(
          error instanceof Error ? error.message : "Stripe checkout sync failed."
        )}`,
        appUrl
      )
    );
  }
}
