import type Stripe from "stripe";
import { getAppUrl, getStripe } from "@/lib/stripe/server";
import {
  ensureRecoveryCaseForPayment,
  markBillingRecoveryResolved
} from "@/lib/billing-recovery";
import { createAndSendMemberNotification } from "@/lib/notifications";
import { formatCurrencyFromCents } from "@/lib/revenue";
import type { AppSupabaseClient } from "@/lib/supabase/types";
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

export function formatStripeConnectSetupError(error: unknown) {
  const fallback =
    error instanceof Error ? error.message : "Stripe onboarding could not start.";

  if (
    fallback.includes("signed up for Connect") ||
    fallback.includes("dashboard.stripe.com/connect")
  ) {
    return "Stripe Connect is not enabled on your Stripe platform yet. Open dashboard.stripe.com/connect in Stripe, finish Connect setup there, then return here and try again.";
  }

  return fallback;
}

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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient;
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
    success_url: `${appUrl}/api/stripe/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
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

export async function syncStripeCheckoutSession(
  supabase: AppSupabaseClient,
  sessionId: string
) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.mode !== "subscription") {
    throw new Error("Stripe session was not a subscription checkout.");
  }

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!stripeSubscriptionId) {
    throw new Error("Stripe subscription was missing from checkout session.");
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const subscription = await syncStripeSubscription(supabase, stripeSubscription);

  let paymentResult: Awaited<ReturnType<typeof syncStripeInvoice>> | null = null;
  const latestInvoiceId =
    typeof stripeSubscription.latest_invoice === "string"
      ? stripeSubscription.latest_invoice
      : stripeSubscription.latest_invoice?.id ?? null;

  if (latestInvoiceId) {
    const invoice = await stripe.invoices.retrieve(latestInvoiceId);
    paymentResult = await syncStripeInvoice(supabase, invoice);
  }

  return {
    sessionId: session.id,
    subscription,
    payment: paymentResult?.payment ?? null
  };
}

export async function updateGymStripeState(
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
  subscription: Stripe.Subscription
) {
  const subscriptionRecord = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const metadata = getSubscriptionMetadata(subscription);

  if (!metadata.gymId || !metadata.memberId) {
    return null;
  }

  const payload = {
    gym_id: metadata.gymId,
    member_id: metadata.memberId,
    membership_plan_id: metadata.membershipPlanId,
    status: normalizeSubscriptionStatus(subscription.status),
    current_period_start: subscriptionRecord.current_period_start
      ? new Date(subscriptionRecord.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscriptionRecord.current_period_end
      ? new Date(subscriptionRecord.current_period_end * 1000).toISOString()
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
  invoice: Stripe.Invoice
) {
  const stripe = getStripe();
  const invoiceRecord = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    payment_intent?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | null;
      } | null;
    } | null;
    lines?: {
      data?: Array<{
        parent?: {
          subscription_item_details?: {
            subscription?: string | null;
          } | null;
        } | null;
      }>;
    } | null;
  };
  const stripeSubscriptionId =
    typeof invoiceRecord.subscription === "string"
      ? invoiceRecord.subscription
      : invoiceRecord.subscription?.id ??
        invoiceRecord.parent?.subscription_details?.subscription ??
        invoiceRecord.lines?.data?.[0]?.parent?.subscription_item_details?.subscription;

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
    due_at: invoice.due_date
      ? new Date(invoice.due_date * 1000).toISOString()
      : null,
    invoice_number: invoice.number ?? null,
    description: invoice.description ?? `Stripe invoice ${invoice.id}`,
    payment_type: "membership",
    accounting_category: "membership",
    stripe_payment_intent_id:
      typeof invoiceRecord.payment_intent === "string"
        ? invoiceRecord.payment_intent
        : invoiceRecord.payment_intent?.id ?? null,
    stripe_invoice_id: invoice.id
  } satisfies Database["public"]["Tables"]["payments"]["Insert"];

  const existingPaymentResult = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle();

  if (existingPaymentResult.error) {
    throw new Error(existingPaymentResult.error.message);
  }

  const paymentResult = existingPaymentResult.data
    ? await supabase
        .from("payments")
        .update(paymentPayload)
        .eq("id", existingPaymentResult.data.id)
        .eq("gym_id", localSubscription.gym_id)
        .select("*")
        .single()
    : await supabase.from("payments").insert(paymentPayload).select("*").single();

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
    await ensureRecoveryCaseForPayment(supabase, paymentResult.data);

    await createFailedPaymentInsight(supabase, {
      gymId: localSubscription.gym_id,
      memberId: localSubscription.member_id,
      amountCents: paymentPayload.amount_cents,
      invoiceId: invoice.id ?? "unknown_invoice"
    });

    await createAndSendMemberNotification(supabase, {
      gymId: localSubscription.gym_id,
      memberId: localSubscription.member_id,
      title: "Payment issue on your membership",
      body: "Your recent membership payment failed. Please update your payment method with the gym.",
      type: "billing"
    });
  }

  if (paymentStatus === "succeeded") {
    const openCaseResult = await supabase
      .from("billing_recovery_cases")
      .select("*")
      .eq("gym_id", localSubscription.gym_id)
      .or(`payment_id.eq.${paymentResult.data.id},stripe_invoice_id.eq.${invoice.id}`)
      .in("status", ["open", "retrying", "waiting_on_member"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openCaseResult.error && openCaseResult.data) {
      await markBillingRecoveryResolved(
        supabase,
        openCaseResult.data,
        "Stripe invoice was paid."
      );
    }
  }

  return {
    payment: paymentResult.data,
    subscription: subscriptionUpdate.data as SubscriptionRow
  };
}
