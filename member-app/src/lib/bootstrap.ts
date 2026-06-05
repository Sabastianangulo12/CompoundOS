import { supabase } from "./supabase";
import type {
  CheckInRecord,
  GymRecord,
  MemberAppContext,
  MemberRecord,
  MemberStats
} from "./member";
import type { GymAnnouncementRecord } from "./news";
import type { MemberNotification } from "./notifications";

const bootstrapTimeoutMs = 10000;

type BootstrapPayload = {
  member: MemberRecord | null;
  gym: GymRecord | null;
  stats: {
    totalVisits: number;
    lastCheckInAt: string | null;
  } | null;
  recentCheckIns: CheckInRecord[];
  notifications: MemberNotification[];
  announcements: GymAnnouncementRecord[];
};

export async function fetchMemberAppBootstrap() {
  const result = await withTimeout(
    Promise.resolve(
      supabase.rpc("get_member_app_bootstrap", {
        notifications_limit: 12,
        announcements_limit: 6,
        recent_checkins_limit: 90
      })
    ),
    bootstrapTimeoutMs,
    "Member startup is taking too long. Please try again."
  );

  if (result.error) {
    return {
      data: null,
      error: result.error
    };
  }

  const payload = (result.data ?? null) as BootstrapPayload | null;

  if (!payload?.member) {
    return {
      data: null,
      error: null
    };
  }

  const recentCheckIns = payload.recentCheckIns ?? [];
  const totalVisits = payload.stats?.totalVisits ?? 0;

  return {
    data: {
      context: {
        member: payload.member,
        gym: payload.gym
      } satisfies MemberAppContext,
      stats: {
        totalVisits,
        streak: calculateVisitStreak(recentCheckIns),
        lastCheckInAt: payload.stats?.lastCheckInAt ?? recentCheckIns[0]?.created_at ?? null
      } satisfies MemberStats,
      recentCheckIns,
      notifications: payload.notifications ?? [],
      announcements: payload.announcements ?? []
    },
    error: null
  };
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

function calculateVisitStreak(checkIns: CheckInRecord[]) {
  const uniqueDays = Array.from(
    new Set(
      checkIns.map((checkIn) =>
        new Date(checkIn.created_at).toISOString().slice(0, 10)
      )
    )
  );

  if (uniqueDays.length === 0) {
    return 0;
  }

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = 0; index < uniqueDays.length; index += 1) {
    const comparison = new Date(today);
    comparison.setDate(today.getDate() - index);

    if (uniqueDays[index] !== comparison.toISOString().slice(0, 10)) {
      if (index === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (uniqueDays[0] !== yesterday.toISOString().slice(0, 10)) {
          return 0;
        }

        streak += 1;
        continue;
      }

      break;
    }

    streak += 1;
  }

  return streak;
}
