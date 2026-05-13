import { NextResponse } from "next/server";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createConnectOnboardingLink } from "@/lib/stripe-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return NextResponse.redirect(
      new URL(
        currentGym.error
          ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
          : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
      )
    );
  }

  const gymResult = await supabase
    .from("gyms")
    .select("*")
    .eq("id", currentGym.data.membership.gymId)
    .single();

  if (gymResult.error || !gymResult.data) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent(
          gymResult.error?.message ?? "Gym not found."
        )}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
      )
    );
  }

  try {
    const link = await createConnectOnboardingLink(supabase, gymResult.data);
    return NextResponse.redirect(link.url);
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent(
          error instanceof Error ? error.message : "Stripe onboarding refresh failed."
        )}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
      )
    );
  }
}
