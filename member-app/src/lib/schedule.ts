import { supabase } from "./supabase";
import { getApiBaseUrl } from "./api";

const scheduleRequestTimeoutMs = 15000;

export type MemberScheduleSession = {
  id: string;
  title: string;
  description: string | null;
  instructorName: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  capacityLabel: string;
  spotsRemaining: number | null;
  bookingEnabled: boolean;
  waitlistEnabled: boolean;
  costCents: number;
  program: {
    id: string;
    name: string;
    color: string;
  } | null;
  counts: {
    booked: number;
    checkedIn: number;
    waitlisted: number;
    noShow: number;
  };
  memberBooking: {
    id: string;
    status: "booked" | "waitlisted" | "canceled" | "checked_in" | "no_show";
  } | null;
};

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function requestSchedule<T>(path: string, init?: RequestInit) {
  const token = await getAccessToken();

  if (!token) {
    return {
      data: null,
      error: new Error("You need to be signed in to manage bookings.")
    };
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, scheduleRequestTimeoutMs);
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutHandle);
    });
    const payload = (await response.json().catch(() => null)) as
      | T
      | {
          error?: string;
        }
      | null;

    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          (payload as { error?: string } | null)?.error ??
            "Schedule request failed."
        )
      };
    }

    return {
      data: payload as T,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: new Error(
        error instanceof Error && error.name === "AbortError"
          ? "Schedule request timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Network request failed."
      )
    };
  }
}

export async function fetchMemberSchedule() {
  const result = await requestSchedule<{
    sessions: MemberScheduleSession[];
  }>("/api/member-schedule");

  return {
    data: result.data?.sessions ?? null,
    error: result.error
  };
}

export async function bookScheduleSession(sessionId: string) {
  return requestSchedule<{ booking: unknown }>("/api/member-schedule/book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId
    })
  });
}

export async function cancelScheduleBooking(bookingId: string) {
  return requestSchedule<{ booking: unknown }>("/api/member-schedule/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      bookingId
    })
  });
}
