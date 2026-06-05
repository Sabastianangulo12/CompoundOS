import { Linking } from "react-native";
import { supabase } from "./supabase";
import { getApiBaseUrl } from "./api";

const billingRequestTimeoutMs = 15000;

export type MemberBillingSummary = {
  membershipStatus: "active" | "frozen" | "canceled" | "lead";
  billingCycle: "monthly" | "weekly" | null;
  membershipPlanName: string | null;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  hasCardOnFile: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  frozenUntil: string | null;
  gymBillingReady: boolean;
  gymBillingMessage: string | null;
};

export type MembershipPlanOption = {
  id: string;
  name: string;
  priceCents: number;
  billingInterval: "monthly" | "weekly";
};

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      fetch(input, init),
      new Promise<Response>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("Billing request timed out. Please try again."));
        }, billingRequestTimeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function fetchMemberBillingSummary() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: new Error("You need to be signed in to view billing.")
    };
  }

  try {
    const result = await withRpcTimeout(
      Promise.resolve(supabase.rpc("get_member_billing_summary")),
      "Billing request timed out. Please try again."
    );
    const summary = Array.isArray(result.data) ? result.data[0] : null;

    if (result.error || !summary) {
      return {
        data: null,
        error: new Error(result.error?.message ?? "Billing fetch failed.")
      };
    }

    return {
      data: {
        membershipStatus: summary.membership_status as MemberBillingSummary["membershipStatus"],
        billingCycle: (summary.billing_cycle as MemberBillingSummary["billingCycle"]) ?? null,
        membershipPlanName: summary.membership_plan_name ?? null,
        currentPeriodEnd: summary.current_period_end ?? null,
        currentPeriodStart: summary.current_period_start ?? null,
        hasCardOnFile: summary.has_card_on_file,
        cardBrand: summary.card_brand ?? null,
        cardLast4: summary.card_last4 ?? null,
        frozenUntil: summary.frozen_until ?? null,
        gymBillingReady: Boolean(summary.gym_billing_ready),
        gymBillingMessage: summary.gym_billing_message ?? null
      },
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: new Error(
        error instanceof Error ? error.message : "Billing fetch failed."
      )
    };
  }
}

export async function fetchAvailableMembershipPlans(gymId: string) {
  const result = await supabase
    .from("membership_plans")
    .select("id, name, price_cents, billing_interval")
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .order("price_cents", {
      ascending: true
    });

  if (result.error) {
    return {
      data: null,
      error: result.error
    };
  }

  return {
    data: (result.data ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceCents: plan.price_cents,
      billingInterval: plan.billing_interval
    })) as MembershipPlanOption[],
    error: null
  };
}

export async function syncMemberBillingState() {
  const token = await getAccessToken();

  if (!token) {
    return {
      error: new Error("You need to be signed in to sync billing.")
    };
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/member-billing/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => null)) as
      | { canceled: boolean; remindersCreated: number }
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        error: new Error((payload as { error?: string } | null)?.error ?? "Billing sync failed.")
      };
    }

    return {
      data: payload as { canceled: boolean; remindersCreated: number },
      error: null
    };
  } catch (error) {
    return {
      error: new Error(
        error instanceof Error ? error.message : "Billing sync failed."
      )
    };
  }
}

async function withRpcTimeout<T>(promise: PromiseLike<T>, message: string) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message));
        }, billingRequestTimeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function openBillingCardSetup() {
  const token = await getAccessToken();

  if (!token) {
    return {
      error: new Error("You need to be signed in to manage your card.")
    };
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/member-billing/setup-card`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => null)) as
      | { url: string }
      | { error?: string }
      | null;

    if (!response.ok || !payload || !("url" in payload)) {
      return {
        error: new Error((payload as { error?: string } | null)?.error ?? "Card setup failed.")
      };
    }

    await Linking.openURL(payload.url);
    return { error: null };
  } catch (error) {
    return {
      error: new Error(
        error instanceof Error ? error.message : "Card setup failed."
      )
    };
  }
}

export async function freezeMembership(weeks: number) {
  const token = await getAccessToken();

  if (!token) {
    return {
      error: new Error("You need to be signed in to freeze your membership.")
    };
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/member-billing/freeze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ weeks })
    });
    const payload = (await response.json().catch(() => null)) as
      | { frozenUntil: string }
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        error: new Error((payload as { error?: string } | null)?.error ?? "Freeze failed.")
      };
    }

    return {
      data: payload as { frozenUntil: string },
      error: null
    };
  } catch (error) {
    return {
      error: new Error(
        error instanceof Error ? error.message : "Freeze failed."
      )
    };
  }
}

export async function cancelMembership() {
  const token = await getAccessToken();

  if (!token) {
    return {
      error: new Error("You need to be signed in to cancel your membership.")
    };
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/member-billing/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => null)) as
      | { canceledAt: string }
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        error: new Error((payload as { error?: string } | null)?.error ?? "Cancellation failed.")
      };
    }

    return {
      data: payload as { canceledAt: string },
      error: null
    };
  } catch (error) {
    return {
      error: new Error(
        error instanceof Error ? error.message : "Cancellation failed."
      )
    };
  }
}

export async function renewMembership() {
  const token = await getAccessToken();

  if (!token) {
    return {
      error: new Error("You need to be signed in to renew your membership.")
    };
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/member-billing/resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => null)) as
      | { renewedAt: string }
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        error: new Error((payload as { error?: string } | null)?.error ?? "Renewal failed.")
      };
    }

    return {
      data: payload as { renewedAt: string },
      error: null
    };
  } catch (error) {
    return {
      error: new Error(
        error instanceof Error ? error.message : "Renewal failed."
      )
    };
  }
}
