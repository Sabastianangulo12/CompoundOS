import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CoachScreen } from "./coach-screen";
import { WorkoutsScreen } from "./workouts-screen";
import type { CoachMessage } from "../lib/ai-coach";
import type {
  CheckInRecord,
  MemberAppContext,
  MemberStats
} from "../lib/member";
import type { WorkoutRecord, WorkoutSetInput } from "../lib/workouts";
import { colors } from "../theme";

type TrainingMode = "coach" | "workouts";

export function TrainingScreen({
  memberContext,
  memberStats,
  recentWorkouts,
  recentCheckIns,
  pending,
  suggestedDraft,
  onCreateWorkout,
  onStartWorkout
}: {
  memberContext: MemberAppContext;
  memberStats: MemberStats;
  recentWorkouts: WorkoutRecord[];
  recentCheckIns: CheckInRecord[];
  pending: boolean;
  suggestedDraft?: {
    title: string;
    notes?: string;
    sets: Array<{
      exercise: string;
      sets: number;
      reps: string;
      weight: string;
    }>;
  } | null;
  onCreateWorkout: (input: {
    title: string;
    performedAt?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  }) => Promise<boolean>;
  onStartWorkout: (message: CoachMessage) => void;
}) {
  const [mode, setMode] = useState<TrainingMode>("coach");

  useEffect(() => {
    if (suggestedDraft) {
      setMode("workouts");
    }
  }, [suggestedDraft]);

  function handleStartWorkout(message: CoachMessage) {
    onStartWorkout(message);
    setMode("workouts");
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 8,
          backgroundColor: colors.background
        }}
      >
        <SegmentButton
          active={mode === "coach"}
          label="Coach"
          onPress={() => setMode("coach")}
        />
        <SegmentButton
          active={mode === "workouts"}
          label="Workouts"
          onPress={() => setMode("workouts")}
        />
      </View>
      {mode === "coach" ? (
        <CoachScreen
          memberContext={memberContext}
          memberStats={memberStats}
          onStartWorkout={handleStartWorkout}
          recentCheckIns={recentCheckIns}
          recentWorkouts={recentWorkouts}
        />
      ) : (
        <WorkoutsScreen
          onCreateWorkout={onCreateWorkout}
          pending={pending}
          suggestedDraft={suggestedDraft}
          workouts={recentWorkouts}
        />
      )}
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accent : colors.panel
      }}
    >
      <Text
        style={{
          color: active ? "#151515" : colors.text,
          fontSize: 15,
          fontWeight: "700"
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
