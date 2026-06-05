import crypto from "node:crypto";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type AdminClient = AppSupabaseClient;
type MemberRow = Database["public"]["Tables"]["members"]["Row"];
type FridgeProductRow = Database["public"]["Tables"]["fridge_products"]["Row"];
type SessionStatus = Database["public"]["Tables"]["fridge_unlock_sessions"]["Row"]["status"];

export type SelectedWalletItemInput = {
  productId: string;
  quantity: number;
};

export type SelectedWalletItemSnapshot = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
};

export async function getActiveFridgeProducts(
  admin: AdminClient,
  gymId: string
) {
  const result = await admin
    .from("fridge_products")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .order("sort_order", {
      ascending: true
    })
    .order("created_at", {
      ascending: false
    });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

export async function createFridgeUnlockSession(input: {
  admin: AdminClient;
  member: MemberRow;
  selectedItems: SelectedWalletItemInput[];
  expiresInSeconds?: number;
}) {
  const products = await getProductsByIds(
    input.admin,
    input.member.gym_id,
    input.selectedItems.map((item) => item.productId)
  );
  const selectedItemSnapshot = buildSelectedItemSnapshot(products, input.selectedItems);
  const estimatedTotalCents = selectedItemSnapshot.reduce(
    (sum, item) => sum + item.total_price_cents,
    0
  );
  const qrToken = crypto.randomBytes(18).toString("base64url");
  const expiresInSeconds = input.expiresInSeconds ?? 90;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const result = await input.admin
    .from("fridge_unlock_sessions")
    .insert({
      gym_id: input.member.gym_id,
      member_id: input.member.id,
      selected_items: selectedItemSnapshot,
      estimated_total_cents: estimatedTotalCents,
      status: "pending",
      qr_token: qrToken,
      expires_at: expiresAt
    })
    .select("*")
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Fridge session could not be created.");
  }

  return result.data;
}

export async function unlockFridgeSession(input: {
  admin: AdminClient;
  qrToken: string;
  fridgeLabel?: string;
}) {
  const { data: session, error } = await input.admin
    .from("fridge_unlock_sessions")
    .select("*")
    .eq("qr_token", input.qrToken)
    .maybeSingle();

  if (error || !session) {
    throw new Error(error?.message ?? "Unlock session not found.");
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at);

  if (session.status === "confirmed") {
    return session;
  }

  if (session.status === "expired" || expiresAt.getTime() <= now.getTime()) {
    await updateFridgeSessionStatus(input.admin, session.id, "expired");
    throw new Error("QR token has expired.");
  }

  if (session.status === "canceled") {
    throw new Error("This fridge session was canceled.");
  }

  const unlockedSession =
    session.status === "unlocked"
      ? session
      : await updateFridgeSessionStatus(input.admin, session.id, "unlocked");

  await upsertFridgeAccessEvent(input.admin, {
    sessionId: unlockedSession.id,
    gymId: unlockedSession.gym_id,
    memberId: unlockedSession.member_id,
    status: "unlocked",
    fridgeLabel: input.fridgeLabel ?? "Smart Fridge",
    selectedItems: unlockedSession.selected_items,
    estimatedTotalCents: unlockedSession.estimated_total_cents
  });

  return unlockedSession;
}

export async function confirmFridgePurchase(input: {
  admin: AdminClient;
  member: MemberRow;
  sessionId: string;
  selectedItems: SelectedWalletItemInput[];
}) {
  const { data: session, error } = await input.admin
    .from("fridge_unlock_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .eq("member_id", input.member.id)
    .eq("gym_id", input.member.gym_id)
    .maybeSingle();

  if (error || !session) {
    throw new Error(error?.message ?? "Fridge session not found.");
  }

  if (!["pending", "unlocked"].includes(session.status)) {
    throw new Error("This fridge session can no longer be confirmed.");
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await updateFridgeSessionStatus(input.admin, session.id, "expired");
    throw new Error("This fridge session has expired.");
  }

  const products = await getProductsByIds(
    input.admin,
    input.member.gym_id,
    input.selectedItems.map((item) => item.productId)
  );
  const selectedItemSnapshot = buildSelectedItemSnapshot(products, input.selectedItems);
  const subtotalCents = selectedItemSnapshot.reduce(
    (sum, item) => sum + item.total_price_cents,
    0
  );

  if (subtotalCents <= 0) {
    throw new Error("Add at least one item before confirming purchase.");
  }

  const existingOrder = await input.admin
    .from("fridge_orders")
    .select("*")
    .eq("fridge_unlock_session_id", session.id)
    .eq("gym_id", input.member.gym_id)
    .maybeSingle();

  if (existingOrder.error) {
    throw new Error(existingOrder.error.message);
  }

  if (existingOrder.data?.status === "paid") {
    return {
      order: existingOrder.data,
      receipt: existingOrder.data.receipt
    };
  }

  const stripe = getStripe();
  const paymentMethodId = await resolveMemberPaymentMethodId(
    input.admin,
    stripe,
    input.member
  );

  if (!input.member.stripe_customer_id) {
    throw new Error("No Stripe customer is linked to this member yet.");
  }

  if (!paymentMethodId) {
    throw new Error("No saved payment method is on file for this member.");
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: subtotalCents,
      currency: "usd",
      customer: input.member.stripe_customer_id,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      metadata: {
        gymId: input.member.gym_id,
        memberId: input.member.id,
        fridgeUnlockSessionId: session.id
      }
    },
    {
      idempotencyKey: `fridge-order:${session.id}`
    }
  );

  if (paymentIntent.status !== "succeeded") {
    throw new Error("Payment could not be completed for this fridge order.");
  }

  const orderPayload = {
    gym_id: input.member.gym_id,
    member_id: input.member.id,
    fridge_unlock_session_id: session.id,
    subtotal_cents: subtotalCents,
    status: "paid" as const,
    stripe_payment_intent_id: paymentIntent.id,
    receipt: {
      payment_intent_id: paymentIntent.id,
      amount_cents: subtotalCents,
      status: paymentIntent.status,
      confirmed_at: new Date().toISOString(),
      items: selectedItemSnapshot
    }
  };

  const orderResult = existingOrder.data
    ? await input.admin
        .from("fridge_orders")
        .update(orderPayload)
        .eq("id", existingOrder.data.id)
        .eq("gym_id", input.member.gym_id)
        .eq("member_id", input.member.id)
        .select("*")
        .single()
    : await input.admin.from("fridge_orders").insert(orderPayload).select("*").single();

  if (orderResult.error || !orderResult.data) {
    throw new Error(orderResult.error?.message ?? "Fridge order could not be saved.");
  }

  if (!existingOrder.data) {
    const itemRows = selectedItemSnapshot.map((item) => ({
      fridge_order_id: orderResult.data.id,
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_price_cents: item.total_price_cents
    }));

    const itemsResult = await input.admin.from("fridge_order_items").insert(itemRows);

    if (itemsResult.error) {
      throw new Error(itemsResult.error.message);
    }
  }

  await updateFridgeSessionStatus(input.admin, session.id, "confirmed");
  await upsertFridgeAccessEvent(input.admin, {
    sessionId: session.id,
    gymId: input.member.gym_id,
    memberId: input.member.id,
    status: "confirmed",
    fridgeLabel: "Smart Fridge",
    selectedItems: selectedItemSnapshot,
    estimatedTotalCents: subtotalCents
  });

  return {
    order: orderResult.data,
    receipt: orderResult.data.receipt
  };
}

async function getProductsByIds(
  admin: AdminClient,
  gymId: string,
  productIds: string[]
) {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return [] as FridgeProductRow[];
  }

  const result = await admin
    .from("fridge_products")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

function buildSelectedItemSnapshot(
  products: FridgeProductRow[],
  selectedItems: SelectedWalletItemInput[]
) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return selectedItems
    .map((item) => {
      const product = productMap.get(item.productId);
      const quantity = Math.max(0, Math.floor(item.quantity));

      if (!product || quantity <= 0) {
        return null;
      }

      return {
        product_id: product.id,
        name: product.name,
        quantity,
        unit_price_cents: product.price_cents,
        total_price_cents: product.price_cents * quantity
      } satisfies SelectedWalletItemSnapshot;
    })
    .filter((item): item is SelectedWalletItemSnapshot => Boolean(item));
}

async function updateFridgeSessionStatus(
  admin: AdminClient,
  sessionId: string,
  status: SessionStatus
) {
  const result = await admin
    .from("fridge_unlock_sessions")
    .update({
      status
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Fridge session could not be updated.");
  }

  return result.data;
}

async function upsertFridgeAccessEvent(
  admin: AdminClient,
  input: {
    sessionId: string;
    gymId: string;
    memberId: string;
    status: SessionStatus;
    fridgeLabel: string;
    selectedItems: unknown;
    estimatedTotalCents: number;
  }
) {
  const existing = await admin
    .from("fridge_access_events")
    .select("*")
    .eq("fridge_unlock_session_id", input.sessionId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const payload = {
    gym_id: input.gymId,
    member_id: input.memberId,
    fridge_unlock_session_id: input.sessionId,
    fridge_label: input.fridgeLabel,
    selected_items: input.selectedItems as Database["public"]["Tables"]["fridge_access_events"]["Insert"]["selected_items"],
    estimated_total_cents: input.estimatedTotalCents,
    status: input.status
  };

  const result = existing.data
    ? await admin
        .from("fridge_access_events")
        .update(payload)
        .eq("id", existing.data.id)
    : await admin.from("fridge_access_events").insert(payload);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function resolveMemberPaymentMethodId(
  admin: AdminClient,
  stripe: Stripe,
  member: MemberRow
) {
  if (member.stripe_default_payment_method_id) {
    return member.stripe_default_payment_method_id;
  }

  if (!member.stripe_customer_id) {
    return null;
  }

  const customer = await stripe.customers.retrieve(member.stripe_customer_id);

  if ("deleted" in customer) {
    return null;
  }

  const paymentMethodId =
    typeof customer.invoice_settings.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method?.id ?? null;

  if (paymentMethodId) {
    await admin
      .from("members")
      .update({
        stripe_default_payment_method_id: paymentMethodId
      })
      .eq("id", member.id)
      .eq("gym_id", member.gym_id);
  }

  return paymentMethodId;
}

export function formatWalletCurrency(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}
