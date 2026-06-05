import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { supabase } from "./supabase";
import { formatCount } from "./format";
import type { MemberAppContext } from "./member";
import { getApiBaseUrl } from "./api";

const walletPinStorageKey = "compoundos/member/wallet-pin";
const walletRequestTimeoutMs = 15000;

export type WalletProduct = {
  id: string;
  gym_id: string;
  category: "drinks_fridge" | "meal_prep_fridge" | "protein_candy" | "tclc_merch";
  name: string;
  description: string | null;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WalletSelectedItem = {
  productId: string;
  quantity: number;
};

export type FridgeUnlockSessionRecord = {
  id: string;
  gym_id: string;
  member_id: string;
  selected_items: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    total_price_cents: number;
  }>;
  estimated_total_cents: number;
  status: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  qr_token: string;
  expires_at: string;
  created_at: string;
};

export type WalletReceipt = {
  payment_intent_id?: string;
  amount_cents?: number;
  status?: string;
  confirmed_at?: string;
  items?: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    total_price_cents: number;
  }>;
};

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function fetchWalletProducts(context: MemberAppContext) {
  const token = await getAccessToken();

  if (!token) {
    return {
      data: null,
      error: new Error("You need to be signed in to load wallet products.")
    };
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, walletRequestTimeoutMs);
    const response = await fetch(`${getApiBaseUrl()}/api/fridge/products`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutHandle);
    });
    const payload = (await response.json().catch(() => null)) as
      | WalletProduct[]
      | {
          error?: string;
        }
      | null;

    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          (payload && !Array.isArray(payload) ? payload.error : null) ??
            "Wallet products could not be loaded."
        )
      };
    }

    return {
      data: (Array.isArray(payload) ? payload : []) as WalletProduct[],
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: new Error(
        error instanceof Error && error.name === "AbortError"
          ? "Wallet products timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Network request failed."
      )
    };
  }
}

export async function fetchUnlockSession(sessionId: string) {
  const result = await supabase
    .from("fridge_unlock_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  return {
    data: (result.data as FridgeUnlockSessionRecord | null) ?? null,
    error: result.error
  };
}

export async function createUnlockSession(selectedItems: WalletSelectedItem[]) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: new Error("You need to be signed in to unlock the fridge.")
    };
  }

  try {
    const result = await withTimeout<{
      data: FridgeUnlockSessionRecord[] | null;
      error: { message: string } | null;
    }>(
      Promise.resolve(
        supabase.rpc("create_member_fridge_unlock_session", {
          selected_items_payload: selectedItems,
          expires_in_seconds: 90
        })
      ),
      walletRequestTimeoutMs,
      "Fridge unlock timed out. Check your connection and try again."
    );
    const sessionRecord = Array.isArray(result.data) ? result.data[0] : result.data;

    if (result.error || !sessionRecord) {
      return {
        data: null,
        error: new Error(result.error?.message ?? "Fridge unlock failed.")
      };
    }

    return {
      data: sessionRecord as FridgeUnlockSessionRecord,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: new Error(error instanceof Error ? error.message : "Network request failed.")
    };
  }
}

export async function confirmWalletPurchase(input: {
  sessionId: string;
  selectedItems: WalletSelectedItem[];
}) {
  const token = await getAccessToken();

  if (!token) {
    return {
      data: null,
      error: new Error("You need to be signed in to confirm this purchase.")
    };
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, walletRequestTimeoutMs);
    const response = await fetch(`${getApiBaseUrl()}/api/fridge/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(input),
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutHandle);
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          orderId: string;
          status: string;
          subtotal: string;
          receipt: WalletReceipt;
        }
      | {
          error?: string;
        }
      | null;

    if (!response.ok) {
      return {
        data: null,
        error: new Error((payload as { error?: string } | null)?.error ?? "Purchase confirmation failed.")
      };
    }

    return {
      data: payload as {
        orderId: string;
        status: string;
        subtotal: string;
        receipt: WalletReceipt;
      },
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: new Error(
        error instanceof Error && error.name === "AbortError"
          ? "Purchase confirmation timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Network request failed."
      )
    };
  }
}

export function calculateWalletTotal(
  products: WalletProduct[],
  selectedItems: WalletSelectedItem[]
) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return selectedItems.reduce((sum, item) => {
    const product = productMap.get(item.productId);

    if (!product || item.quantity <= 0) {
      return sum;
    }

    return sum + product.price_cents * item.quantity;
  }, 0);
}

export function formatWalletCurrency(amountCents: number) {
  const dollars = Math.floor(Math.abs(amountCents) / 100);
  const cents = Math.abs(amountCents) % 100;
  const sign = amountCents < 0 ? "-" : "";
  return `${sign}$${formatCount(dollars)}.${String(cents).padStart(2, "0")}`;
}

export async function getSavedWalletPin() {
  return AsyncStorage.getItem(walletPinStorageKey).catch(() => null);
}

export async function saveWalletPin(pin: string) {
  await AsyncStorage.setItem(walletPinStorageKey, pin);
}

export async function authenticateWalletWithBiometrics() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware || !isEnrolled) {
    return {
      success: false,
      reason: "Biometric unlock is unavailable on this device."
    };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Smart Fridge Wallet",
    fallbackLabel: "Use PIN"
  });

  return {
    success: result.success,
    reason: result.success ? null : result.error ?? "Authentication failed."
  };
}
