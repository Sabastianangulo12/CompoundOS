"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { membershipPlansTag } from "@/lib/member-intake";
import {
  getMembershipPlanByIdForGym,
  getSubscriptionByIdForGym,
  isBillingInterval,
  isPaymentStatus,
  isSubscriptionStatus
} from "@/lib/revenue";
import { getMemberByIdForGym } from "@/lib/members";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasStripeServerEnv } from "@/lib/env";
import {
  createConnectOnboardingLink,
  createSubscriptionCheckoutSession,
  formatStripeConnectSetupError
} from "@/lib/stripe-sync";

function revenueMessage(pathname: string, message: string) {
  return `${pathname}?message=${encodeURIComponent(message)}`;
}

function parseCurrencyToCents(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "").trim();
  const amount = Number.parseFloat(normalized);

  if (Number.isNaN(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function normalizeNullableDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : null;
}

function deriveSubscriptionPeriod(
  billingInterval: "monthly" | "weekly",
  currentPeriodStart: string | null,
  currentPeriodEnd: string | null
) {
  const startDate = currentPeriodStart ? new Date(currentPeriodStart) : new Date();

  if (Number.isNaN(startDate.getTime())) {
    return {
      currentPeriodStart: null,
      currentPeriodEnd: null
    };
  }

  if (currentPeriodEnd) {
    return {
      currentPeriodStart: startDate.toISOString(),
      currentPeriodEnd
    };
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (billingInterval === "weekly" ? 7 : 30));

  return {
    currentPeriodStart: startDate.toISOString(),
    currentPeriodEnd: endDate.toISOString()
  };
}

export async function createPlanAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const priceInput = String(formData.get("price") ?? "").trim();
  const billingInterval = String(formData.get("billingInterval") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const priceCents = parseCurrencyToCents(priceInput);

  if (!name || priceCents === null || !isBillingInterval(billingInterval)) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        "Plan name, valid price, and billing interval are required."
      )
    );
  }

  const { error } = await supabase.from("membership_plans").insert({
    gym_id: currentGym.data.membership.gymId,
    name,
    price_cents: priceCents,
    billing_interval: billingInterval
  });

  if (error) {
    redirect(revenueMessage("/dashboard/revenue", error.message));
  }

  revalidateTag(membershipPlansTag(currentGym.data.membership.gymId));
  revalidatePath("/dashboard/revenue");
  redirect(revenueMessage("/dashboard/revenue", "Plan created."));
}

export async function updatePlanAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const priceInput = String(formData.get("price") ?? "").trim();
  const billingInterval = String(formData.get("billingInterval") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const priceCents = parseCurrencyToCents(priceInput);

  if (!planId || !name || priceCents === null || !isBillingInterval(billingInterval)) {
    redirect(
      revenueMessage(
        `/dashboard/revenue/plans/${planId}/edit`,
        "Plan name, valid price, and billing interval are required."
      )
    );
  }

  const existingPlan = await getMembershipPlanByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    planId
  );

  if (existingPlan.error || !existingPlan.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        existingPlan.error?.message ?? "Plan not found."
      )
    );
  }

  const { error } = await supabase
    .from("membership_plans")
    .update({
      name,
      price_cents: priceCents,
      billing_interval: billingInterval
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", planId);

  if (error) {
    redirect(revenueMessage(`/dashboard/revenue/plans/${planId}/edit`, error.message));
  }

  revalidateTag(membershipPlansTag(currentGym.data.membership.gymId));
  revalidatePath("/dashboard/revenue");
  redirect(revenueMessage("/dashboard/revenue", "Plan updated."));
}

export async function archivePlanAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!planId) {
    redirect(revenueMessage("/dashboard/revenue", "Plan not found."));
  }

  const { error } = await supabase
    .from("membership_plans")
    .update({
      is_active: false,
      archived_at: new Date().toISOString()
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", planId);

  if (error) {
    redirect(revenueMessage("/dashboard/revenue", error.message));
  }

  revalidateTag(membershipPlansTag(currentGym.data.membership.gymId));
  revalidatePath("/dashboard/revenue");
  redirect(revenueMessage("/dashboard/revenue", "Plan archived."));
}

export async function createSubscriptionAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const membershipPlanId = String(formData.get("membershipPlanId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const currentPeriodStart = normalizeNullableDate(formData.get("currentPeriodStart"));
  const currentPeriodEnd = normalizeNullableDate(formData.get("currentPeriodEnd"));
  const targetPath = redirectTo || "/dashboard/revenue";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!memberId || !membershipPlanId || !isSubscriptionStatus(status)) {
    redirect(
      revenueMessage(
        targetPath,
        "Member, plan, and subscription status are required."
      )
    );
  }

  const [memberResult, planResult] = await Promise.all([
    getMemberByIdForGym(supabase, currentGym.data.membership.gymId, memberId),
    getMembershipPlanByIdForGym(supabase, currentGym.data.membership.gymId, membershipPlanId)
  ]);

  if (memberResult.error || !memberResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        memberResult.error?.message ?? "Member not found."
      )
    );
  }

  if (planResult.error || !planResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        planResult.error?.message ?? "Plan not found."
      )
    );
  }

  const existingSubscription = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("member_id", memberId)
    .in("status", ["active", "past_due", "trialing"])
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (existingSubscription.error) {
    redirect(revenueMessage(targetPath, existingSubscription.error.message));
  }

  const derivedPeriod = deriveSubscriptionPeriod(
    planResult.data.billing_interval,
    currentPeriodStart,
    currentPeriodEnd
  );

  const payload = {
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    membership_plan_id: membershipPlanId,
    status,
    current_period_start: derivedPeriod.currentPeriodStart,
    current_period_end: derivedPeriod.currentPeriodEnd
  };

  const { error } = existingSubscription.data
    ? await supabase
        .from("subscriptions")
        .update(payload)
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("id", existingSubscription.data.id)
    : await supabase.from("subscriptions").insert(payload);

  if (error) {
    redirect(revenueMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard/revenue");
  revalidatePath(`/dashboard/members/${memberId}/edit`);
  redirect(
    revenueMessage(
      targetPath,
      existingSubscription.data ? "Subscription updated." : "Subscription created."
    )
  );
}

export async function archiveSubscriptionAction(formData: FormData) {
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!subscriptionId) {
    redirect(revenueMessage("/dashboard/revenue", "Subscription not found."));
  }

  const subscriptionResult = await getSubscriptionByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    subscriptionId
  );

  if (subscriptionResult.error || !subscriptionResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        subscriptionResult.error?.message ?? "Subscription not found."
      )
    );
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", subscriptionId);

  if (error) {
    redirect(revenueMessage("/dashboard/revenue", error.message));
  }

  revalidatePath("/dashboard/revenue");
  revalidatePath(`/dashboard/members/${subscriptionResult.data.member_id}/edit`);
  redirect(revenueMessage("/dashboard/revenue", "Subscription archived."));
}

export async function createPaymentAction(formData: FormData) {
  const amountInput = String(formData.get("amount") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  const paidAt = normalizeNullableDate(formData.get("paidAt"));
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const amountCents = parseCurrencyToCents(amountInput);

  if (amountCents === null || !isPaymentStatus(status)) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        "Valid payment amount and status are required."
      )
    );
  }

  if (memberId) {
    const memberResult = await getMemberByIdForGym(
      supabase,
      currentGym.data.membership.gymId,
      memberId
    );

    if (memberResult.error || !memberResult.data) {
      redirect(
        revenueMessage(
          "/dashboard/revenue",
          memberResult.error?.message ?? "Member not found."
        )
      );
    }
  }

  if (subscriptionId) {
    const subscriptionResult = await getSubscriptionByIdForGym(
      supabase,
      currentGym.data.membership.gymId,
      subscriptionId
    );

    if (subscriptionResult.error || !subscriptionResult.data) {
      redirect(
        revenueMessage(
          "/dashboard/revenue",
          subscriptionResult.error?.message ?? "Subscription not found."
        )
      );
    }
  }

  const { error } = await supabase.from("payments").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId || null,
    subscription_id: subscriptionId || null,
    amount_cents: amountCents,
    status,
    paid_at: paidAt
  });

  if (error) {
    redirect(revenueMessage("/dashboard/revenue", error.message));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revenue");
  if (memberId) {
    revalidatePath(`/dashboard/members/${memberId}/edit`);
  }
  redirect(revenueMessage("/dashboard/revenue", "Payment recorded."));
}

export async function startStripeConnectOnboardingAction() {
  if (!hasStripeServerEnv()) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        "Stripe server environment variables are not configured."
      )
    );
  }

  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const gymResult = await supabase
    .from("gyms")
    .select("*")
    .eq("id", currentGym.data.membership.gymId)
    .single();

  if (gymResult.error || !gymResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        gymResult.error?.message ?? "Gym could not be loaded for Stripe onboarding."
      )
    );
  }

  let onboardingUrl: string;
  try {
    const accountLink = await createConnectOnboardingLink(supabase, gymResult.data);
    onboardingUrl = accountLink.url;
  } catch (error) {
    redirect(revenueMessage("/dashboard/revenue", formatStripeConnectSetupError(error)));
  }

  redirect(onboardingUrl);
}

export async function startStripeCheckoutAction(formData: FormData) {
  if (!hasStripeServerEnv()) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        "Stripe server environment variables are not configured."
      )
    );
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const membershipPlanId = String(formData.get("membershipPlanId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || "/dashboard/revenue";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!memberId || !membershipPlanId) {
    redirect(
      revenueMessage(
        targetPath,
        "Select a member and plan before opening Stripe checkout."
      )
    );
  }

  const [gymResult, memberResult, planResult] = await Promise.all([
    supabase
      .from("gyms")
      .select("*")
      .eq("id", currentGym.data.membership.gymId)
      .single(),
    getMemberByIdForGym(supabase, currentGym.data.membership.gymId, memberId),
    getMembershipPlanByIdForGym(supabase, currentGym.data.membership.gymId, membershipPlanId)
  ]);

  if (gymResult.error || !gymResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        gymResult.error?.message ?? "Gym could not be loaded."
      )
    );
  }

  if (memberResult.error || !memberResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        memberResult.error?.message ?? "Member not found."
      )
    );
  }

  if (planResult.error || !planResult.data) {
    redirect(
      revenueMessage(
        "/dashboard/revenue",
        planResult.error?.message ?? "Plan not found."
      )
    );
  }

  let checkoutUrl: string;
  try {
    const session = await createSubscriptionCheckoutSession({
      supabase,
      gym: gymResult.data,
      member: memberResult.data,
      plan: planResult.data
    });

    if (!session.url) {
      throw new Error("Stripe checkout URL was missing.");
    }

    checkoutUrl = session.url;
  } catch (error) {
    redirect(
      revenueMessage(
        targetPath,
        error instanceof Error ? error.message : "Stripe checkout could not start."
      )
    );
  }

  redirect(checkoutUrl);
}
