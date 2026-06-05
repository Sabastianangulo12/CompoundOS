import type Stripe from "stripe";
import { hasStripeServerEnv } from "@/lib/env";
import { getAppUrl, getStripe } from "@/lib/stripe/server";
import { createAndSendMemberNotification } from "@/lib/notifications";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type AdminClient = AppSupabaseClient;
type MemberRow = Database["public"]["Tables"]["members"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type MembershipEventRow = Database["public"]["Tables"]["member_membership_events"]["Row"];
type MembershipEventType = MembershipEventRow["event_type"];
type FreezeReminderType =
  Database["public"]["Tables"]["member_freeze_reminders"]["Row"]["reminder_type"];

export type MemberBillingSummary = {
  membershipStatus: MemberRow["status"];
  billingCycle: string | null;
  membershipPlanName: string | null;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  hasCardOnFile: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  frozenUntil: string | null;
};

export async function getMemberBillingSummary(
  admin: AdminClient,
  member: MemberRow
): Promise<MemberBillingSummary> {
  const rpcResult = await admin.rpc("get_member_billing_summary");

  if (!rpcResult.error) {
    const summaryRow = Array.isArray(rpcResult.data) ? rpcResult.data[0] : null;

    if (summaryRow) {
      return {
        membershipStatus: summaryRow.membership_status,
        billingCycle: summaryRow.billing_cycle,
        membershipPlanName: summaryRow.membership_plan_name,
        currentPeriodEnd: summaryRow.current_period_end,
        currentPeriodStart: summaryRow.current_period_start,
        hasCardOnFile: Boolean(summaryRow.has_card_on_file),
        cardBrand: summaryRow.card_brand,
        cardLast4: summaryRow.card_last4,
        frozenUntil: summaryRow.frozen_until
      };
    }
  }

  const subscriptionResult = await admin
    .from("subscriptions")
    .select(
      `
        id,
        current_period_end,
        current_period_start,
        membership_plans (
          id,
          name,
          billing_interval
        )
      `
    )
    .eq("gym_id", member.gym_id)
    .eq("member_id", member.id)
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (subscriptionResult.error) {
    throw new Error(subscriptionResult.error.message);
  }

  const subscription = subscriptionResult.data as
    | (SubscriptionRow & {
        membership_plans: {
          id: string;
          name: string;
          billing_interval: "monthly" | "weekly";
        } | null;
      })
    | null;

  return {
    membershipStatus: member.status,
    billingCycle: subscription?.membership_plans?.billing_interval ?? null,
    membershipPlanName: subscription?.membership_plans?.name ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    currentPeriodStart: subscription?.current_period_start ?? null,
    hasCardOnFile: Boolean(
      member.stripe_default_payment_method_id || member.stripe_customer_id
    ),
    cardBrand: null,
    cardLast4: null,
    frozenUntil: member.frozen_until
  };
}

export async function createMemberCardSetupUrl(
  admin: AdminClient,
  member: MemberRow
) {
  if (!hasStripeServerEnv()) {
    throw new Error("Billing is not configured yet. Add your Stripe server keys first.");
  }

  const gymResult = await admin
    .from("gyms")
    .select(
      "id, stripe_connected_account_id, stripe_onboarding_completed, stripe_charges_enabled"
    )
    .eq("id", member.gym_id)
    .maybeSingle();

  if (gymResult.error) {
    throw new Error(gymResult.error.message);
  }

  if (!gymResult.data?.stripe_connected_account_id || !gymResult.data.stripe_charges_enabled) {
    throw new Error(
      "Gym billing is not ready yet. Ask staff to connect Stripe before adding a card."
    );
  }

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(admin, member, stripe);
  const successUrl = `${getAppUrl()}/api/member-billing/setup-card/return?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${getAppUrl()}/billing/card-canceled`;

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    metadata: {
      gymId: member.gym_id,
      memberId: member.id,
      flow: "member_card_setup"
    }
  });

  if (!session.url) {
    throw new Error("Stripe did not return a secure card setup URL.");
  }

  return session.url;
}

export async function syncMemberCardSetupSession(
  admin: AdminClient,
  input: {
    sessionId?: string;
    session?: Stripe.Checkout.Session;
  }
) {
  const stripe = getStripe();
  const session =
    input.session ??
    (await stripe.checkout.sessions.retrieve(input.sessionId ?? "", {
      expand: ["setup_intent", "setup_intent.payment_method"]
    }));

  if (session.mode !== "setup") {
    throw new Error("Stripe session was not a card setup flow.");
  }

  const gymId = session.metadata?.gymId ?? null;
  const memberId = session.metadata?.memberId ?? null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (!gymId || !memberId || !customerId) {
    throw new Error("Stripe session metadata was incomplete.");
  }

  let setupIntent = session.setup_intent;

  if (typeof setupIntent === "string") {
    setupIntent = await stripe.setupIntents.retrieve(setupIntent, {
      expand: ["payment_method"]
    });
  }

  if (!setupIntent || typeof setupIntent === "string") {
    throw new Error("Stripe did not return a completed setup intent.");
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id ?? null;

  if (!paymentMethodId) {
    throw new Error("Stripe did not return a saved payment method.");
  }

  const existingMemberResult = await admin
    .from("members")
    .select("stripe_default_payment_method_id")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .maybeSingle();

  if (existingMemberResult.error) {
    throw new Error(existingMemberResult.error.message);
  }

  const previousPaymentMethodId =
    existingMemberResult.data?.stripe_default_payment_method_id ?? null;

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  });

  const memberResult = await admin
    .from("members")
    .update({
      stripe_customer_id: customerId,
      stripe_default_payment_method_id: paymentMethodId
    })
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .select("id")
    .maybeSingle();

  if (memberResult.error || !memberResult.data) {
    throw new Error(memberResult.error?.message ?? "Member card setup could not be saved.");
  }

  if (previousPaymentMethodId !== paymentMethodId) {
    await createAndSendMemberNotification(admin, {
      gymId,
      memberId,
      title: "Card on file updated",
      body: "Your default card on file has been saved successfully.",
      type: "billing"
    });
  }

  return {
    gymId,
    memberId,
    customerId,
    paymentMethodId
  };
}

export async function freezeMemberMembership(
  admin: AdminClient,
  member: MemberRow,
  weeks: number
) {
  const currentMember = await getLatestMemberState(admin, member);

  if (weeks !== 4) {
    throw new Error("Freeze duration must be 4 weeks.");
  }

  if (currentMember.status === "canceled") {
    throw new Error("Canceled memberships cannot be frozen.");
  }

  if (currentMember.status === "frozen" && currentMember.frozen_until) {
    return currentMember.frozen_until;
  }

  const frozenUntil = new Date();
  frozenUntil.setDate(frozenUntil.getDate() + weeks * 7);
  const frozenUntilDate = frozenUntil.toISOString().slice(0, 10);

  const { error } = await admin
    .from("members")
    .update({
      status: "frozen",
      frozen_until: frozenUntilDate,
      canceled_at: null
    })
    .eq("id", currentMember.id)
    .eq("gym_id", currentMember.gym_id);

  if (error) {
    throw new Error(error.message);
  }

  const subscription = await getLatestSubscription(admin, currentMember);

  if (subscription?.id) {
    await admin
      .from("subscriptions")
      .update({
        status: "past_due"
      })
      .eq("id", subscription.id)
      .eq("gym_id", currentMember.gym_id);
  }

  await recordMembershipEvent(admin, {
    gymId: currentMember.gym_id,
    memberId: currentMember.id,
    eventType: "frozen",
    reason: "member_requested",
    frozenUntil: frozenUntilDate
  });

  await createAndSendMemberNotification(admin, {
    gymId: currentMember.gym_id,
    memberId: currentMember.id,
    title: "Membership frozen",
    body: `Your membership is frozen until ${formatReadableDate(
      frozenUntilDate
    )}. It will be canceled after that date if you do not resume it.`,
    type: "billing"
  });

  return frozenUntilDate;
}

export async function cancelMemberMembership(
  admin: AdminClient,
  member: MemberRow,
  options?: {
    reason?: string;
    notifyMember?: boolean;
  }
) {
  const currentMember = await getLatestMemberState(admin, member);

  if (currentMember.status === "canceled") {
    return currentMember.canceled_at ?? new Date().toISOString();
  }

  const subscription = await getLatestSubscription(admin, currentMember);

  if (subscription?.stripe_subscription_id) {
    const stripe = getStripe();
    try {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (error) {
      if (!isMissingStripeSubscriptionError(error)) {
        throw error;
      }
    }
  }

  if (subscription?.id) {
    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false
      })
      .eq("id", subscription.id)
      .eq("gym_id", currentMember.gym_id);

    if (subscriptionError) {
      throw new Error(subscriptionError.message);
    }
  }

  const canceledAt = new Date().toISOString();
  const { error } = await admin
    .from("members")
    .update({
      status: "canceled",
      canceled_at: canceledAt,
      frozen_until: null
    })
    .eq("id", currentMember.id)
    .eq("gym_id", currentMember.gym_id);

  if (error) {
    throw new Error(error.message);
  }

  await recordMembershipEvent(admin, {
    gymId: currentMember.gym_id,
    memberId: currentMember.id,
    eventType: "canceled",
    reason: options?.reason ?? "member_requested",
    frozenUntil: currentMember.frozen_until
  });

  if (options?.notifyMember ?? true) {
    await createAndSendMemberNotification(admin, {
      gymId: currentMember.gym_id,
      memberId: currentMember.id,
      title: "Membership canceled",
      body:
        options?.reason === "freeze_expired"
          ? "Your frozen membership reached the end of its 4-week hold and has now been canceled."
          : "Your membership has been canceled and your member app access has been revoked.",
      type: "billing"
    });
  }

  return canceledAt;
}

export async function resumeMemberMembership(
  admin: AdminClient,
  member: MemberRow
) {
  const currentMember = await getLatestMemberState(admin, member);

  if (currentMember.status === "active") {
    return {
      renewedAt: currentMember.updated_at ?? new Date().toISOString()
    };
  }

  if (currentMember.status !== "frozen") {
    throw new Error("Only frozen memberships can be renewed.");
  }

  const { error } = await admin
    .from("members")
    .update({
      status: "active",
      frozen_until: null,
      canceled_at: null
    })
    .eq("id", currentMember.id)
    .eq("gym_id", currentMember.gym_id);

  if (error) {
    throw new Error(error.message);
  }

  const subscription = await getLatestSubscription(admin, currentMember);

  if (subscription?.id) {
    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        cancel_at_period_end: false
      })
      .eq("id", subscription.id)
      .eq("gym_id", currentMember.gym_id);

    if (subscriptionError) {
      throw new Error(subscriptionError.message);
    }
  }

  await createAndSendMemberNotification(admin, {
    gymId: currentMember.gym_id,
    memberId: currentMember.id,
    title: "Membership renewed",
    body: "Your membership has been renewed and your account is active again.",
    type: "billing"
  });

  return {
    renewedAt: new Date().toISOString()
  };
}

export async function syncMemberBillingLifecycle(
  admin: AdminClient,
  member: MemberRow
) {
  if (member.status !== "frozen" || !member.frozen_until) {
    return {
      member,
      canceled: false,
      remindersCreated: 0
    };
  }

  const today = getTodayDateString();

  if (member.frozen_until < today) {
    await cancelMemberMembership(admin, member, {
      reason: "freeze_expired",
      notifyMember: true
    });

    return {
      member: null,
      canceled: true,
      remindersCreated: 0
    };
  }

  let remindersCreated = 0;
  const daysUntilEnd = getDaysBetween(today, member.frozen_until);

  if (daysUntilEnd === 7) {
    const created = await createFreezeReminderIfDue(admin, member, "one_week");
    remindersCreated += created ? 1 : 0;
  }

  if (daysUntilEnd === 2) {
    const created = await createFreezeReminderIfDue(admin, member, "two_days");
    remindersCreated += created ? 1 : 0;
  }

  return {
    member,
    canceled: false,
    remindersCreated
  };
}

export async function syncGymFrozenMemberships(admin: AdminClient, gymId: string) {
  const result = await admin
    .from("members")
    .select(
      "id, gym_id, user_id, first_name, last_name, email, phone, stripe_customer_id, stripe_default_payment_method_id, status, frozen_until, canceled_at, joined_at, created_at, updated_at"
    )
    .eq("gym_id", gymId)
    .eq("status", "frozen");

  if (result.error) {
    throw new Error(result.error.message);
  }

  let canceledCount = 0;
  let remindersCreated = 0;

  for (const member of result.data ?? []) {
    const syncResult = await syncMemberBillingLifecycle(admin, member as MemberRow);
    if (syncResult.canceled) {
      canceledCount += 1;
    }
    remindersCreated += syncResult.remindersCreated;
  }

  return {
    canceledCount,
    remindersCreated
  };
}

async function getLatestSubscription(admin: AdminClient, member: MemberRow) {
  const result = await admin
    .from("subscriptions")
    .select(
      "id, gym_id, member_id, stripe_subscription_id, status, cancel_at_period_end, current_period_start, current_period_end, created_at"
    )
    .eq("gym_id", member.gym_id)
    .eq("member_id", member.id)
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

async function getLatestMemberState(admin: AdminClient, member: MemberRow) {
  const result = await admin
    .from("members")
    .select(
      "id, gym_id, user_id, first_name, last_name, email, phone, stripe_customer_id, stripe_default_payment_method_id, status, frozen_until, canceled_at, joined_at, created_at, updated_at"
    )
    .eq("id", member.id)
    .eq("gym_id", member.gym_id)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Member profile not found.");
  }

  return result.data as MemberRow;
}

async function ensureStripeCustomer(
  admin: AdminClient,
  member: MemberRow,
  stripe: Stripe
) {
  if (member.stripe_customer_id) {
    return member.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: member.email ?? undefined,
    name: `${member.first_name} ${member.last_name}`.trim(),
    metadata: {
      gymId: member.gym_id,
      memberId: member.id
    }
  });

  const { error } = await admin
    .from("members")
    .update({
      stripe_customer_id: customer.id
    })
    .eq("id", member.id)
    .eq("gym_id", member.gym_id);

  if (error) {
    throw new Error(error.message);
  }

  return customer.id;
}

async function recordMembershipEvent(
  admin: AdminClient,
  input: {
    gymId: string;
    memberId: string;
    eventType: MembershipEventType;
    reason?: string | null;
    frozenUntil?: string | null;
  }
) {
  const { error } = await admin.from("member_membership_events").insert({
    gym_id: input.gymId,
    member_id: input.memberId,
    event_type: input.eventType,
    reason: input.reason ?? null,
    frozen_until: input.frozenUntil ?? null
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function createFreezeReminderIfDue(
  admin: AdminClient,
  member: MemberRow,
  reminderType: FreezeReminderType
) {
  if (!member.frozen_until) {
    return false;
  }

  const existingReminder = await admin
    .from("member_freeze_reminders")
    .select("id")
    .eq("gym_id", member.gym_id)
    .eq("member_id", member.id)
    .eq("reminder_type", reminderType)
    .eq("frozen_until", member.frozen_until)
    .maybeSingle();

  if (existingReminder.error) {
    throw new Error(existingReminder.error.message);
  }

  if (existingReminder.data) {
    return false;
  }

  const title =
    reminderType === "one_week"
      ? "Frozen membership reminder"
      : "Final freeze reminder";
  const body =
    reminderType === "one_week"
      ? `Your membership is still frozen. It will be canceled on ${formatReadableDate(
          member.frozen_until
        )} if you do not resume it.`
      : `Your membership freeze ends on ${formatReadableDate(
          member.frozen_until
        )}. It will be canceled in 2 days if you do not resume it.`;

  await createAndSendMemberNotification(admin, {
    gymId: member.gym_id,
    memberId: member.id,
    title,
    body,
    type: "billing"
  });

  const { error } = await admin.from("member_freeze_reminders").insert({
    gym_id: member.gym_id,
    member_id: member.id,
    reminder_type: reminderType,
    frozen_until: member.frozen_until
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getDaysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function formatReadableDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
    dateStyle: "medium"
  });
}

function isMissingStripeSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };

  return (
    candidate.code === "resource_missing" &&
    candidate.statusCode === 404 &&
    candidate.type === "StripeInvalidRequestError"
  );
}
