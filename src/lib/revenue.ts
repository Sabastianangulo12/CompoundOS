import type { AppSupabaseClient } from "@/lib/supabase/types";
import { toOneRelation } from "@/lib/supabase/relations";
import type { Database } from "@/types/database";

export const billingIntervals = ["monthly", "weekly"] as const;
export const subscriptionStatuses = [
  "active",
  "past_due",
  "trialing",
  "canceled"
] as const;
export const paymentStatuses = [
  "succeeded",
  "failed",
  "pending",
  "scheduled",
  "overdue",
  "refunded"
] as const;

export type BillingInterval = (typeof billingIntervals)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];

export function isBillingInterval(value: string): value is BillingInterval {
  return billingIntervals.includes(value as BillingInterval);
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return subscriptionStatuses.includes(value as SubscriptionStatus);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus);
}

export function formatCurrencyFromCents(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export type MembershipPlanWithSubscriptions =
  Database["public"]["Tables"]["membership_plans"]["Row"] & {
    subscriptions?: Array<Pick<Database["public"]["Tables"]["subscriptions"]["Row"], "id">>;
  };

export type SubscriptionWithRelations =
  Database["public"]["Tables"]["subscriptions"]["Row"] & {
    members: Pick<
      Database["public"]["Tables"]["members"]["Row"],
      "id" | "first_name" | "last_name" | "email"
    > | null;
    membership_plans: Pick<
      Database["public"]["Tables"]["membership_plans"]["Row"],
      "id" | "name" | "price_cents" | "billing_interval"
    > | null;
  };

export type PaymentWithRelations = Database["public"]["Tables"]["payments"]["Row"] & {
  members: Pick<
    Database["public"]["Tables"]["members"]["Row"],
    "id" | "first_name" | "last_name"
  > | null;
  subscriptions: Pick<
    Database["public"]["Tables"]["subscriptions"]["Row"],
    "id" | "status"
  > | null;
};

export async function getMembershipPlanByIdForGym(
  supabase: AppSupabaseClient,
  gymId: string,
  planId: string
) {
  return supabase
    .from("membership_plans")
    .select("*")
    .eq("gym_id", gymId)
    .eq("id", planId)
    .maybeSingle();
}

export async function getSubscriptionByIdForGym(
  supabase: AppSupabaseClient,
  gymId: string,
  subscriptionId: string
) {
  return supabase
    .from("subscriptions")
    .select("*")
    .eq("gym_id", gymId)
    .eq("id", subscriptionId)
    .maybeSingle();
}

export async function getRevenueSnapshot(
  supabase: AppSupabaseClient,
  gymId: string
) {
  const [subscriptionsResult, paymentsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        `
          status,
          membership_plans (
            price_cents,
            billing_interval
          )
        `
      )
      .eq("gym_id", gymId),
    supabase
      .from("payments")
      .select("*", {
        count: "exact"
      })
      .eq("gym_id", gymId)
      .eq("status", "failed")
  ]);

  if (subscriptionsResult.error) {
    return {
      error: subscriptionsResult.error
    };
  }

  if (paymentsResult.error) {
    return {
      error: paymentsResult.error
    };
  }

  const subscriptions = ((subscriptionsResult.data ?? []) as Array<{
    status: Database["public"]["Tables"]["subscriptions"]["Row"]["status"];
    membership_plans:
      Pick<
        Database["public"]["Tables"]["membership_plans"]["Row"],
        "price_cents" | "billing_interval"
      > | Array<
        Pick<
          Database["public"]["Tables"]["membership_plans"]["Row"],
          "price_cents" | "billing_interval"
        >
      > | null;
  }>).map((subscription) => ({
    status: subscription.status,
    membership_plans: toOneRelation(subscription.membership_plans)
  }));

  const estimatedMonthlyRecurringRevenue = subscriptions.reduce((total, subscription) => {
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      return total;
    }

    const plan = subscription.membership_plans;

    if (!plan) {
      return total;
    }

    if (plan.billing_interval === "weekly") {
      return total + Math.round(plan.price_cents * 52 / 12);
    }

    return total + plan.price_cents;
  }, 0);

  return {
    error: null,
    estimatedMonthlyRecurringRevenue,
    activeSubscriptions: subscriptions.filter((subscription) => subscription.status === "active")
      .length,
    pastDueSubscriptions: subscriptions.filter((subscription) => subscription.status === "past_due")
      .length,
    failedPayments: paymentsResult.count ?? 0
  };
}
