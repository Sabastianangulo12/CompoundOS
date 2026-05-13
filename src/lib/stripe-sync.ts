import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl, getStripe } from "@/lib/stripe/server";
import { createAndSendMemberNotification } from "@/lib/notifications";
import { formatCurrencyFromCents } from "@/lib/revenue";
import type { Database } from "@/types/database";

type GymRow = Database["public"]["Tables"]["gyms"]["Row"];
type MemberRow = Database["public"]["Tables"]["members"]["Row"];
type PlanRow = Database["public"]["Tables"]["membership_plans"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

type StripeSubscriptionMetadata = {
  gymId: string | null;
  memberId: string | null;
  membershipPlanId: string | null;
};

function getSubscriptionMetadata(
  subscription: Stripe.Subscription
): StripeSubscriptionMetadata {
  return {
    gymId: subscription.metadata.gymId || null,
    memberId: subscription.metadata.memberId || null,
    membershipPlanId: subscription.metadata.membershipPlanId || null
  };
}

function normalizeSubscriptionStatus(
  status: Stripe.Subscription.Status
): Database["public"]["Tables"]["subscriptions"]["Row"]["status"] {
  if (status === "trialing") {
    return "trialing";
  }

  if (["active", "past_due"].includes(status)) {
    return status as Database["public"]["Tables"]["subscriptions"]["Row"]["status"];
  }

  return "canceled";
}

export async function ensureStripeConnectedAccountForGym(
  supabase: SupabaseClient<Database>,
  gym: GymRow
) {
  const stripe = getStripe();

  if (gym.stripe_connected_account_id) {
    const account = await stripe.accounts.retrieve(gym.stripe_connected_account_id);

    if ("deleted" in account) {
      throw new Error("The Stripe connected account for this gym is no longer available.");
    }

    await updateGymStripeState(supabase, gym.id, account);

    return {
      account
    };
  }

  const account = await stripe.accounts.create({
    type: "express",
    business_type: "company",
    metadata: {
      gymId: gym.id,
      gymSlug: gym.slug
    },
    capabilities: {
      card_payments: {
        requested: true
      },
      transfers: {
        requested: true
      }
    }
  });

  const { error } = await supabase
    .from("gyms")
    .update({
      stripe_connected_account_id: account.id
    })
    .eq("id", gym.id);

  if (error) {
    throw new Error(error.message);
  }

  await updateGymStripeState(supabase, gym.id, account);

  return {
    account
  };
}

export async function createConnectOnboardingLink(
  supabase: SupabaseClient<Database>,
  gym: GymRow
) {
  const stripe = getStripe();
  const { account } = await ensureStripeConnectedAccountForGym(supabase, gym);
  const appUrl = getAppUrl();

  return stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${appUrl}/api/stripe/connect/refresh`,
    return_url: `${appUrl}/api/stripe/connect/return`,
    type: "account_onboarding"
  });
}

export async function syncMembershipPlanToStripe(
  supabase: SupabaseClient<Database>,
  plan: PlanRow
) {
  const stripe = getStripe();
  let productId = plan.stripe_product_id;
  let priceId = plan.stripe_price_id;

  if (productId) {
    await stripe.products.update(productId, {
      name: plan.name,
      metadata: {
        membershipPlanId: plan.id,
        gymId: plan.gym_id
      }
    });
  } else {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: {
        membershipPlanId: plan.id,
        gymId: plan.gym_id
      }
    });

    productId = product.id;
  }

  let shouldCreatePrice = true;

  if (priceId) {
    const existingPrice = await stripe.prices.retrieve(priceId);
    const expectedInterval = plan.billing_interval === "weekly" ? "week" : "month";

    const needsReplacement =
      existingPrice.unit_amount !== plan.price_cents ||
      existingPrice.recurring?.interval !== expectedInterval;

    if (!needsReplacement && existingPrice.active !== plan.is_active) {
      await stripe.prices.update(priceId, {
        active: plan.is_active
      });
    }

    shouldCreatePrice = needsReplacement;
  }

  if (shouldCreatePrice) {
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: plan.price_cents,
      recurring: {
        interval: plan.billing_interval === "weekly" ? "week" : "month"
      },
      active: plan.is_active,
      metadata: {
        membershipPlanId: plan.id,
        gymId: plan.gym_id
      }
    });

    priceId = price.id;
  }

  const { data, error } = await supabase
    .from("membership_plans")
    .update({
      stripe_product_id: productId,
      stripe_price_id: priceId
    })
    .eq("id", plan.id)
    .eq("gym_id", plan.gym_id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Membership plan could not be synced to Stripe.");
  }

  return data;
}

export async function ensureStripeCustomerForMember(
  supabase: SupabaseClient<Database>,
  member: MemberRow,
  gym: GymRow
) {
  const stripe = getStripe();

  if (member.stripe_customer_id) {
    return member.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: member.email ?? undefined,
    name: `${member.first_name} ${member.last_name}`.trim(),
    phone: member.phone ?? undefined,
    metadata: {
      memberId: member.id,
      gymId: gym.id
    }
  });

  const { error } = await supabase
    .from("members")
    .update({
      stripe_customer_id: customer.id
    })
    .eq("id", member.id)
    .eq("gym_id", gym.id);

  if (error) {
    throw new Error(error.message);
  }

  return customer.id;
}

export async function createSubscriptionCheckoutSession(input: {
  supabase: SupabaseClient<Database>;
  gym: GymRow;
  member: MemberRow;
  plan: PlanRow;
}) {
  const stripe = getStripe();
  const appUrl = getAppUrl();
  const { account } = await ensureStripeConnectedAccountForGym(input.supabase, input.gym);
  const customerId = await ensureStripeCustomerForMember(
    input.supabase,
    input.member,
    input.gym
  );
  const syncedPlan = await syncMembershipPlanToStripe(input.supabase, input.plan);

  if (!syncedPlan.stripe_price_id) {
    throw new Error("Stripe price is missing for this membership plan.");
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    success_url: `${appUrl}/dashboard/revenue?message=${encodeURIComponent("Stripe checkout completed. Subscription sync may take a moment.")}`,
    cancel_url: `${appUrl}/dashboard/revenue?message=${encodeURIComponent("Stripe checkout canceled.")}`,
    customer: customerId,
    client_reference_id: input.member.id,
    line_items: [
      {
        price: syncedPlan.stripe_price_id,
        quantity: 1
      }
    ],
    metadata: {
      gymId: input.gym.id,
      memberId: input.member.id,
      membershipPlanId: syncedPlan.id
    },
    subscription_data: {
      metadata: {
        gymId: input.gym.id,
        memberId: input.member.id,
        membershipPlanId: syncedPlan.id
      },
      on_behalf_of: account.id,
      transfer_data: {
        destination: account.id
      }
    }
  });
}

export async function updateGymStripeState(
  supabase: SupabaseClient<Database>,
  gymId: string,
  account: Stripe.Account
) {
  const { error } = await supabase
    .from("gyms")
    .update({
      stripe_connected_account_id: account.id,
      stripe_onboarding_completed: Boolean(account.details_submitted),
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted)
    })
    .eq("id", gymId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getLocalSubscriptionByStripeId(
  supabase: SupabaseClient<Database>,
  stripeSubscriptionId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getExistingLiveSubscriptionForMember(
  supabase: SupabaseClient<Database>,
  gymId: string,
  memberId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("gym_id", gymId)
    .eq("member_id", memberId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function syncStripeSubscription(
  supabase: SupabaseClient<Database>,
  subscription: Stripe.Subscription
) {
  const metadata = getSubscriptionMetadata(subscription);

  if (!metadata.gymId || !metadata.memberId) {
    return null;
  }

  const payload = {
    gym_id: metadata.gymId,
    member_id: metadata.memberId,
    membership_plan_id: metadata.membershipPlanId,
    status: normalizeSubscriptionStatus(subscription.status),
    current_period_start: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_subscription_id: subscription.id
  } satisfies Database["public"]["Tables"]["subscriptions"]["Insert"];

  const existing =
    (await getLocalSubscriptionByStripeId(supabase, subscription.id)) ??
    (await getExistingLiveSubscriptionForMember(
      supabase,
      metadata.gymId,
      metadata.memberId
    ));

  const result = existing
    ? await supabase
        .from("subscriptions")
        .update(payload)
        .eq("id", existing.id)
        .eq("gym_id", metadata.gymId)
        .select("*")
        .single()
    : await supabase.from("subscriptions").insert(payload).select("*").single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Subscription sync failed.");
  }

  if (subscription.customer && typeof subscription.customer === "string") {
    await supabase
      .from("members")
      .update({
        stripe_customer_id: subscription.customer
      })
      .eq("id", metadata.memberId)
      .eq("gym_id", metadata.gymId);
  }

  return result.data;
}

async function createFailedPaymentInsight(
  supabase: SupabaseClient<Database>,
  input: {
    gymId: string;
    memberId: string;
    amountCents: number;
    invoiceId: string;
  }
) {
  const { data: existing } = await supabase
    .from("ai_insights")
    .select("id")
    .eq("gym_id", input.gymId)
    .eq("member_id", input.memberId)
    .eq("type", "failed_payment")
    .eq("status", "open")
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from("ai_insights").insert({
    gym_id: input.gymId,
    member_id: input.memberId,
    type: "failed_payment",
    title: "Payment failed for this membership",
    description: `Stripe reported a failed payment attempt for ${formatCurrencyFromCents(input.amountCents)} on invoice ${input.invoiceId}. Review the payment method and follow up with the member.`,
    priority: "high",
    status: "open"
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncStripeInvoice(
  supabase: SupabaseClient<Database>,
  invoice: Stripe.Invoice
) {
  const stripe = getStripe();
  const stripeSubscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!stripeSubscriptionId) {
    return null;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  let localSubscription = await getLocalSubscriptionByStripeId(supabase, stripeSubscriptionId);

  const syncedSubscription = await syncStripeSubscription(supabase, stripeSubscription);

  if (syncedSubscription) {
    localSubscription = syncedSubscription;
  }

  if (!localSubscription) {
    return null;
  }

  const paymentStatus =
    invoice.status === "paid" ? "succeeded" : invoice.attempted ? "failed" : "pending";

  const paymentPayload = {
    gym_id: localSubscription.gym_id,
    member_id: localSubscription.member_id,
    subscription_id: localSubscription.id,
    amount_cents: invoice.amount_paid > 0 ? invoice.amount_paid : invoice.amount_due,
    status: paymentStatus,
    paid_at:
      invoice.status_transitions.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
    stripe_payment_intent_id:
      typeof invoice.payment_intent === "string"
        ? invoice.payment_intent
        : invoice.payment_intent?.id ?? null,
    stripe_invoice_id: invoice.id
  } satisfies Database["public"]["Tables"]["payments"]["Insert"];

  const paymentResult = await supabase
    .from("payments")
    .upsert(paymentPayload, {
      onConflict: "stripe_invoice_id"
    })
    .select("*")
    .single();

  if (paymentResult.error) {
    throw new Error(paymentResult.error.message);
  }

  const subscriptionStatus =
    paymentStatus === "failed"
      ? "past_due"
      : normalizeSubscriptionStatus(stripeSubscription.status);

  const subscriptionUpdate = await supabase
    .from("subscriptions")
    .update({
      status: subscriptionStatus
    })
    .eq("id", localSubscription.id)
    .eq("gym_id", localSubscription.gym_id)
    .select("*")
    .single();

  if (subscriptionUpdate.error || !subscriptionUpdate.data) {
    throw new Error(subscriptionUpdate.error?.message ?? "Subscription status sync failed.");
  }

  if (paymentStatus === "failed" && localSubscription.member_id) {
    await createFailedPaymentInsight(supabase, {
      gymId: localSubscription.gym_id,
      memberId: localSubscription.member_id,
      amountCents: paymentPayload.amount_cents,
      invoiceId: invoice.id
    });

    await createAndSendMemberNotification(supabase, {
      gymId: localSubscription.gym_id,
      memberId: localSubscription.member_id,
      title: "Payment issue on your membership",
      body: "Your recent membership payment failed. Please update your payment method with the gym.",
      type: "billing"
    });
  }

  return {
    payment: paymentResult.data,
    subscription: subscriptionUpdate.data as SubscriptionRow
  };
}
