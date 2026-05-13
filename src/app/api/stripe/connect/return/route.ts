import { NextResponse } from "next/server";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { updateGymStripeState } from "@/lib/stripe-sync";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return NextResponse.redirect(
      new URL(
        currentGym.error
          ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
          : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`,
        baseUrl
      )
    );
  }

  const gymResult = await supabase
    .from("gyms")
    .select("*")
    .eq("id", currentGym.data.membership.gymId)
    .single();

  if (gymResult.error || !gymResult.data || !gymResult.data.stripe_connected_account_id) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent("Stripe account not found for this gym.")}`,
        baseUrl
      )
    );
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(gymResult.data.stripe_connected_account_id);

    if ("deleted" in account) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/revenue?message=${encodeURIComponent("The Stripe account for this gym is no longer available.")}`,
          baseUrl
        )
      );
    }

    await updateGymStripeState(supabase, gymResult.data.id, account);

    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent("Stripe onboarding status updated.")}`,
        baseUrl
      )
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/revenue?message=${encodeURIComponent(
          error instanceof Error ? error.message : "Stripe return sync failed."
        )}`,
        baseUrl
      )
    );
  }
}
