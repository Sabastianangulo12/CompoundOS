import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

type CoachRequestBody = {
  memberId?: string;
  question?: string;
  recentWorkouts?: Array<{
    title: string;
    performed_at: string;
    workout_sets?: Array<{
      exercise_name: string;
      reps: number;
      weight: number;
    }>;
  }>;
  checkInHistory?: Array<{
    created_at: string;
    check_in_method: string;
  }>;
  basicStats?: {
    streak?: number;
    totalVisits?: number;
    lastCheckInAt?: string | null;
    status?: string;
    gymName?: string | null;
  };
};

const coachResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "suggested_workout", "focus", "intensity"],
  properties: {
    message: {
      type: "string"
    },
    suggested_workout: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exercise", "sets", "reps", "weight"],
        properties: {
          exercise: {
            type: "string"
          },
          sets: {
            type: "integer"
          },
          reps: {
            type: "string"
          },
          weight: {
            type: "string"
          }
        }
      }
    },
    focus: {
      type: "string"
    },
    intensity: {
      type: "string"
    }
  }
} as const;

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      {
        error: "Supabase environment variables are not configured."
      },
      {
        status: 500
      }
    );
  }

  if (!env.openAIApiKey) {
    return NextResponse.json(
      {
        error: "OpenAI API key is not configured."
      },
      {
        status: 500
      }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return NextResponse.json(
      {
        error: "Missing authorization token."
      },
      {
        status: 401
      }
    );
  }

  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json(
      {
        error: userError?.message ?? "Unauthorized."
      },
      {
        status: 401
      }
    );
  }

  const body = (await request.json().catch(() => null)) as CoachRequestBody | null;
  if (!body) {
    return NextResponse.json(
      {
        error: "Invalid request body."
      },
      {
        status: 400
      }
    );
  }
  const memberId = body.memberId?.trim();
  const question = body.question?.trim();

  if (!memberId || !question) {
    return NextResponse.json(
      {
        error: "A member and question are required."
      },
      {
        status: 400
      }
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, first_name, last_name, status, gym_id, gyms ( name )")
    .eq("id", memberId)
    .eq("user_id", user.id)
    .neq("status", "canceled")
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      {
        error: memberError?.message ?? "Member profile not found for this user."
      },
      {
        status: 403
      }
    );
  }

  const recentWorkouts = (body.recentWorkouts ?? []).slice(0, 5);
  const checkInHistory = (body.checkInHistory ?? []).slice(0, 8);
  const basicStats = body.basicStats ?? {};
  const frequencySummary = buildFrequencySummary(recentWorkouts);
  const consistencySummary = buildConsistencySummary(recentWorkouts, checkInHistory);

  const prompt = [
    "You are The Compound AI Coach, an elite strength coach.",
    "Keep every answer concise, practical, and encouraging.",
    "Do not provide medical advice, injury diagnosis, or treatment guidance.",
    "If a question sounds medical, recommend speaking with a qualified clinician.",
    "Use the member's recent data when it is available.",
    "Prioritize actionable output over explanation.",
    "Always return a short explanation plus an optional structured workout plan when useful.",
    "",
    `Member: ${member.first_name} ${member.last_name}`,
    `Gym: ${member.gyms?.name ?? basicStats.gymName ?? "Unknown gym"}`,
    `Status: ${member.status}`,
    `Current streak: ${basicStats.streak ?? 0}`,
    `Total visits: ${basicStats.totalVisits ?? 0}`,
    `Last check-in: ${basicStats.lastCheckInAt ?? "Unknown"}`,
    `Workout frequency summary: ${frequencySummary}`,
    `Consistency summary: ${consistencySummary}`,
    `Recent check-ins: ${JSON.stringify(checkInHistory)}`,
    `Recent workouts: ${JSON.stringify(recentWorkouts)}`,
    "",
    `Question: ${question}`,
    "",
    "Keep the message short. If the user asks what to train today or to adjust a workout, include a suggested_workout array. Focus should be a simple label like Push, Pull, Legs, Full Body, Recovery, or Upper. Intensity should be a short label like Light, Moderate, Hard."
  ].join("\n");

  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAIApiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "ai_coach_response",
          strict: true,
          schema: coachResponseSchema
        }
      }
    })
  });

  if (!openAIResponse.ok) {
    const errorPayload = await openAIResponse.text();

    return NextResponse.json(
      {
        error: errorPayload || "AI coach request failed."
      },
      {
        status: 500
      }
    );
  }

  const payload = (await openAIResponse.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        refusal?: string;
      }>;
    }>;
  };

  const refusal = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal")?.refusal;

  if (refusal) {
    return NextResponse.json({
      message: refusal,
      suggested_workout: [],
      focus: "Recovery",
      intensity: "Light"
    });
  }

  let parsed: unknown = null;

  if (payload.output_text && payload.output_text.trim()) {
    try {
      parsed = JSON.parse(payload.output_text);
    } catch {
      parsed = null;
    }
  }

  return NextResponse.json(
    parsed ?? {
      message:
        "Train a simple full-body session today: one squat or hinge, one press, and one pull.",
      suggested_workout: [],
      focus: "Full Body",
      intensity: "Moderate"
    }
  );
}

function buildFrequencySummary(
  recentWorkouts: NonNullable<CoachRequestBody["recentWorkouts"]>
) {
  if (recentWorkouts.length === 0) {
    return "No recent workouts logged.";
  }

  const latest = new Date(recentWorkouts[0].performed_at).getTime();
  const oldest = new Date(
    recentWorkouts[recentWorkouts.length - 1].performed_at
  ).getTime();
  const windowDays = Math.max(1, Math.ceil((latest - oldest) / (1000 * 60 * 60 * 24)));

  return `${recentWorkouts.length} workouts across roughly ${windowDays} day(s).`;
}

function buildConsistencySummary(
  recentWorkouts: NonNullable<CoachRequestBody["recentWorkouts"]>,
  checkInHistory: NonNullable<CoachRequestBody["checkInHistory"]>
) {
  if (recentWorkouts.length === 0 && checkInHistory.length === 0) {
    return "Low recent training consistency.";
  }

  if (recentWorkouts.length >= 3 || checkInHistory.length >= 4) {
    return "Recent activity looks consistent.";
  }

  return "Recent activity is somewhat inconsistent.";
}
