import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  Card,
  PrimaryButton,
  ScreenScroll,
  SectionTitle,
  SecondaryButton,
  TextField
} from "../components/ui";
import { formatMediumDate } from "../lib/format";
import type { SuggestedWorkoutItem } from "../lib/ai-coach";
import type { WorkoutRecord, WorkoutSetInput } from "../lib/workouts";
import { colors } from "../theme";

type WorkoutDraftSet = {
  id: string;
  exercise_name: string;
  reps: string;
  weight: string;
};

function createDraftSet(index: number): WorkoutDraftSet {
  return {
    id: `set-${Date.now()}-${index}`,
    exercise_name: "",
    reps: "",
    weight: ""
  };
}

export function WorkoutsScreen({
  workouts,
  pending,
  suggestedDraft,
  onCreateWorkout
}: {
  workouts: WorkoutRecord[];
  pending: boolean;
  suggestedDraft?: {
    title: string;
    notes?: string;
    sets: SuggestedWorkoutItem[];
  } | null;
  onCreateWorkout: (input: {
    title: string;
    performedAt?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<WorkoutDraftSet[]>([createDraftSet(1)]);

  useEffect(() => {
    if (!suggestedDraft) {
      return;
    }

    setTitle(suggestedDraft.title);
    setNotes(suggestedDraft.notes ?? "");
    setPerformedAt("");
    setSets(
      suggestedDraft.sets.length > 0
        ? suggestedDraft.sets.flatMap((setItem, index) =>
            Array.from({
              length: Math.max(1, setItem.sets)
            }).map((_, setIndex) => ({
              id: `ai-set-${Date.now()}-${index}-${setIndex}`,
              exercise_name: setItem.exercise,
              reps: setItem.reps,
              weight: setItem.weight.replace(/[^\d.]/g, "")
            }))
          )
        : [createDraftSet(1)]
    );
  }, [suggestedDraft]);

  function updateSet(id: string, field: keyof WorkoutDraftSet, value: string) {
    setSets((current) =>
      current.map((setItem) =>
        setItem.id === id ? { ...setItem, [field]: value } : setItem
      )
    );
  }

  function addSet() {
    setSets((current) => [...current, createDraftSet(current.length + 1)]);
  }

  function removeSet(id: string) {
    setSets((current) =>
      current.length === 1 ? current : current.filter((setItem) => setItem.id !== id)
    );
  }

  async function submitWorkout() {
    const normalizedSets = sets
      .map((setItem, index) => ({
        exercise_name: setItem.exercise_name.trim(),
        set_index: index + 1,
        reps: Number(setItem.reps || "0"),
        weight: Number(setItem.weight || "0")
      }))
      .filter((setItem) => setItem.exercise_name);

    if (!title.trim() || normalizedSets.length === 0) {
      return;
    }

    const didSave = await onCreateWorkout({
      title: title.trim(),
      performedAt: performedAt.trim(),
      notes: notes.trim(),
      sets: normalizedSets
    });

    if (!didSave) {
      return;
    }

    setTitle("");
    setPerformedAt("");
    setNotes("");
    setSets([createDraftSet(1)]);
  }

  return (
    <ScreenScroll>
      <SectionTitle
        title="Workout log"
        subtitle="Track sessions with simple set-by-set entries."
      />

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          New workout
        </Text>
        {suggestedDraft ? (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
            Loaded from AI Coach. You can edit the plan before saving.
          </Text>
        ) : null}
        <TextField
          autoCapitalize="words"
          label="Workout title"
          onChangeText={setTitle}
          placeholder="Upper body strength"
          value={title}
        />
        <TextField
          label="Performed date"
          onChangeText={setPerformedAt}
          placeholder="2026-05-12"
          value={performedAt}
        />
        <TextField
          autoCapitalize="sentences"
          label="Notes"
          multiline
          onChangeText={setNotes}
          placeholder="Optional notes"
          value={notes}
        />

        <View style={{ gap: 12 }}>
          {sets.map((setItem, index) => (
            <View
              key={setItem.id}
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panelElevated,
                padding: 14,
                gap: 12
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Set {index + 1}
                </Text>
                {sets.length > 1 ? (
                  <Text
                    onPress={() => removeSet(setItem.id)}
                    style={{ color: colors.muted, fontSize: 13 }}
                  >
                    Remove
                  </Text>
                ) : null}
              </View>
              <TextField
                autoCapitalize="words"
                label="Exercise"
                onChangeText={(value) => updateSet(setItem.id, "exercise_name", value)}
                placeholder="Back squat"
                value={setItem.exercise_name}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    keyboardType="numeric"
                    label="Reps"
                    onChangeText={(value) => updateSet(setItem.id, "reps", value)}
                    placeholder="5"
                    value={setItem.reps}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    keyboardType="numeric"
                    label="Weight"
                    onChangeText={(value) => updateSet(setItem.id, "weight", value)}
                    placeholder="185"
                    value={setItem.weight}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        <SecondaryButton label="Add set" onPress={addSet} />
        <PrimaryButton
          disabled={pending || !title.trim()}
          label={pending ? "Saving..." : "Save workout"}
          onPress={() => {
            void submitWorkout();
          }}
        />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
          Recent workouts
        </Text>
        {workouts.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            No workouts logged yet.
          </Text>
        ) : (
          <View style={{ gap: 14 }}>
            {workouts.slice(0, 6).map((workout) => (
              <View
                key={workout.id}
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelElevated,
                  padding: 14,
                  gap: 8
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
                  {workout.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {formatMediumDate(workout.performed_at)}{" "}
                  | {workout.workout_sets.length} set
                  {workout.workout_sets.length === 1 ? "" : "s"}
                </Text>
                <View style={{ gap: 6 }}>
                  {workout.workout_sets.slice(0, 3).map((setItem) => (
                    <Text
                      key={setItem.id}
                      style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}
                    >
                      {setItem.exercise_name} | {setItem.reps} reps | {setItem.weight} lb
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScreenScroll>
  );
}
