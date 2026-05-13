import { supabase } from "./supabase";

export type WorkoutSetInput = {
  exercise_name: string;
  set_index: number;
  reps: number;
  weight: number;
};

export type WorkoutSetRecord = {
  id: string;
  workout_id: string;
  exercise_name: string;
  set_index: number;
  reps: number;
  weight: number;
  created_at: string;
};

export type WorkoutRecord = {
  id: string;
  gym_id: string;
  member_id: string;
  title: string;
  notes: string | null;
  performed_at: string;
  created_at: string;
  workout_sets: WorkoutSetRecord[];
};

export async function fetchRecentWorkouts(limit = 5) {
  const result = await supabase
    .from("workouts")
    .select(
      `
        id,
        gym_id,
        member_id,
        title,
        notes,
        performed_at,
        created_at,
        workout_sets (
          id,
          workout_id,
          exercise_name,
          set_index,
          reps,
          weight,
          created_at
        )
      `
    )
    .order("performed_at", {
      ascending: false
    })
    .limit(limit);

  if (result.error) {
    return {
      data: null,
      error: result.error
    };
  }

  return {
    data: ((result.data ?? []) as WorkoutRecord[]).map((workout) => ({
      ...workout,
      workout_sets: [...(workout.workout_sets ?? [])].sort(
        (left, right) => left.set_index - right.set_index
      )
    })),
    error: null
  };
}

export async function createWorkout(input: {
  title: string;
  notes?: string;
  performedAt?: string;
  sets: WorkoutSetInput[];
}) {
  const normalizedPerformedAt =
    input.performedAt?.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.performedAt.trim())
      ? new Date(`${input.performedAt.trim()}T12:00:00`).toISOString()
      : null;

  return supabase.rpc("create_member_workout", {
    workout_title: input.title,
    workout_notes: input.notes?.trim() ? input.notes.trim() : null,
    workout_performed_at: normalizedPerformedAt,
    workout_sets_payload: input.sets.map((setItem, index) => ({
      exercise_name: setItem.exercise_name,
      set_index: setItem.set_index || index + 1,
      reps: setItem.reps,
      weight: setItem.weight
    }))
  });
}
