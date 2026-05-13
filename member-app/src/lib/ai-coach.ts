import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { CheckInRecord, MemberAppContext, MemberStats } from "./member";
import type { WorkoutRecord } from "./workouts";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
const lastRecommendationStorageKey = "ai_coach_last_recommendation";

export type SuggestedWorkoutItem = {
  exercise: string;
  sets: number;
  reps: string;
  weight: string;
};

export type CoachRecommendation = {
  message: string;
  suggested_workout: SuggestedWorkoutItem[];
  focus: string;
  intensity: string;
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendation?: CoachRecommendation | null;
};

export async function askAICoach(input: {
  memberContext: MemberAppContext;
  memberStats: MemberStats;
  recentWorkouts: WorkoutRecord[];
  recentCheckIns: CheckInRecord[];
  question: string;
}) {
  if (!apiUrl) {
    return {
      recommendation: null,
      error: new Error("EXPO_PUBLIC_API_URL is not configured.")
    };
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      recommendation: null,
      error: new Error("You need to be signed in to use AI Coach.")
    };
  }

  let response: Response;

  try {
    response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/ai-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        memberId: input.memberContext.member.id,
        recentWorkouts: input.recentWorkouts,
        checkInHistory: input.recentCheckIns,
        basicStats: {
          streak: input.memberStats.streak,
          totalVisits: input.memberStats.totalVisits,
          lastCheckInAt: input.memberStats.lastCheckInAt,
          status: input.memberContext.member.status,
          gymName: input.memberContext.gym?.name ?? null
        },
        question: input.question
      })
    });
  } catch (error) {
    return {
      recommendation: null,
      error: new Error(
        error instanceof Error ? error.message : "Network request failed."
      )
    };
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    return {
      recommendation: null,
      error: new Error(payload?.error ?? "Coach request failed.")
    };
  }

  const payload = (await response.json()) as CoachRecommendation;
  await storeLastCoachRecommendation(payload);

  return {
    recommendation: payload,
    error: null
  };
}

export async function storeLastCoachRecommendation(
  recommendation: CoachRecommendation
) {
  try {
    await AsyncStorage.setItem(
      lastRecommendationStorageKey,
      JSON.stringify(recommendation)
    );
  } catch {
    // Local recommendation caching is a convenience, not a blocker.
  }
}

export async function getLastCoachRecommendation() {
  const raw = await AsyncStorage.getItem(lastRecommendationStorageKey).catch(
    () => null
  );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CoachRecommendation;
  } catch {
    return null;
  }
}
