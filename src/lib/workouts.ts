import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

export type WorkoutWithSets = Database["public"]["Tables"]["workouts"]["Row"] & {
  workout_sets: Database["public"]["Tables"]["workout_sets"]["Row"][];
};

export async function getRecentWorkoutsForMember(
  supabase: AppSupabaseClient,
  gymId: string,
  memberId: string,
  limit = 5
) {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      `
        *,
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
    .eq("gym_id", gymId)
    .eq("member_id", memberId)
    .order("performed_at", {
      ascending: false
    })
    .limit(limit);

  return {
    data: ((data ?? []) as WorkoutWithSets[]).map((workout) => ({
      ...workout,
      workout_sets: [...(workout.workout_sets ?? [])].sort(
        (left, right) => left.set_index - right.set_index
      )
    })),
    error
  };
}
