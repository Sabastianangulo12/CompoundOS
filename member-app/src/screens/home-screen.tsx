import { useNavigation } from "@react-navigation/native";
import { Pressable, Text, View } from "react-native";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  ScreenScroll,
  SectionTitle,
  StatTile
} from "../components/ui";
import type { MemberAppContext, MemberStats } from "../lib/member";
import {
  getReactionCounts,
  type CommunityPostRecord
} from "../lib/community";
import type { WorkoutRecord } from "../lib/workouts";
import { colors } from "../theme";

export function HomeScreen({
  context,
  stats,
  recentWorkouts,
  communityPosts,
  checkInPending,
  onCheckIn,
  onQuickCommunityLike
}: {
  context: MemberAppContext;
  stats: MemberStats;
  recentWorkouts: WorkoutRecord[];
  communityPosts: CommunityPostRecord[];
  checkInPending: boolean;
  onCheckIn: () => void;
  onQuickCommunityLike: (postId: string) => Promise<void>;
}) {
  const firstName = context.member.first_name;
  const navigation = useNavigation();
  const todaysPlan = buildTodaysPlan(recentWorkouts, stats.streak);
  const communityPreview = communityPosts
    .filter(
      (post) =>
        post.member_id !== context.member.id && post.visibility === "friends_only"
    )
    .slice(0, 3);

  return (
    <ScreenScroll>
      <SectionTitle
        title={`Hey, ${firstName}`}
        subtitle={`${context.gym?.name ?? "The Compound"} | ${formatStatus(context.member.status)}`}
      />

      <Card>
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Ready for today's session?
        </Text>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
          Tap once to check in
        </Text>
        <PrimaryButton
          disabled={checkInPending}
          label={checkInPending ? "Checking in..." : "Check In"}
          onPress={onCheckIn}
        />
      </Card>

      <Card>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.4
          }}
        >
          Today's plan
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          {todaysPlan.title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {todaysPlan.body}
        </Text>
        <SecondaryButton
          label="Ask Coach"
          onPress={() => navigation.navigate("Coach" as never)}
        />
      </Card>

      <Card>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.4
          }}
        >
          Recent workouts
        </Text>
        {recentWorkouts.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            No workouts logged yet.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {recentWorkouts.slice(0, 3).map((workout) => (
              <View
                key={workout.id}
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelElevated,
                  padding: 14,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
                  {workout.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {new Date(workout.performed_at).toLocaleDateString("en-US", {
                    dateStyle: "medium"
                  })}{" "}
                  | {workout.workout_sets.length} set
                  {workout.workout_sets.length === 1 ? "" : "s"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: colors.muted,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 1.4
              }}
            >
              Activity feed preview
            </Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
              Friend activity at a glance
            </Text>
          </View>
          <SecondaryButton
            label="Open"
            onPress={() => navigation.navigate("Community" as never)}
          />
        </View>
        {communityPreview.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
            No friend activity yet. Once accepted friends start posting, you’ll see it
            here.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {communityPreview.map((post) => {
              const fireCount = getReactionCounts(post.post_likes)["🔥"];

              return (
                <Pressable
                  key={post.id}
                  onPress={() => navigation.navigate("Community" as never)}
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.panelElevated,
                    padding: 14,
                    gap: 8
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
                      >
                        {post.members?.first_name} {post.members?.last_name}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {new Date(post.created_at).toLocaleDateString("en-US", {
                          dateStyle: "medium"
                        })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        void onQuickCommunityLike(post.id);
                      }}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        paddingHorizontal: 12,
                        paddingVertical: 9
                      }}
                    >
                      <Text
                        style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}
                      >
                        🔥 {fireCount}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                    {post.body ?? "Shared a new update"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatTile
          label="Streak"
          value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`}
        />
        <StatTile label="Total visits" value={String(stats.totalVisits)} />
      </View>

      <Card>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.4
          }}
        >
          Member status
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          {formatStatus(context.member.status)}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          Your home view is loaded from your gym-linked member profile and only
          shows your own attendance data.
        </Text>
      </Card>

      <Card>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.4
          }}
        >
          Last check-in
        </Text>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
          {stats.lastCheckInAt
            ? new Date(stats.lastCheckInAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: context.gym?.timezone
              })
            : "No check-ins yet"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          Your history stays scoped to your gym and updates immediately after
          each recorded visit.
        </Text>
      </Card>
    </ScreenScroll>
  );
}

function formatStatus(status: MemberAppContext["member"]["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildTodaysPlan(workouts: WorkoutRecord[], streak: number) {
  const lastWorkout = workouts[0] ?? null;
  const daysSinceLastWorkout = lastWorkout
    ? Math.floor(
        (Date.now() - new Date(lastWorkout.performed_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : Number.POSITIVE_INFINITY;

  if (!lastWorkout || daysSinceLastWorkout >= 2) {
    return {
      title: "Full-body reset",
      body:
        "You have not logged a workout in a couple of days. Hit one squat or hinge, one press, one pull, and finish with a short conditioning piece."
    };
  }

  const lastType = detectSessionType(lastWorkout.title);

  if (streak >= 2) {
    return {
      title: `Next up: ${getNextSessionLabel(lastType)}`,
      body:
        "You have been consistent lately. Keep momentum by rotating to the next session focus and leaving 1 to 2 reps in reserve on your main work."
    };
  }

  return {
    title: `Build from ${formatSessionLabel(lastType)}`,
    body:
      "Stay simple today. Repeat your recent structure with one small progression, like an extra rep on top sets or a modest weight increase if form is solid."
  };
}

function detectSessionType(title: string) {
  const normalized = title.toLowerCase();

  if (normalized.includes("push")) {
    return "push";
  }

  if (normalized.includes("pull")) {
    return "pull";
  }

  if (normalized.includes("leg") || normalized.includes("lower")) {
    return "lower";
  }

  if (normalized.includes("upper")) {
    return "upper";
  }

  if (normalized.includes("full")) {
    return "full_body";
  }

  return "general";
}

function getNextSessionLabel(sessionType: ReturnType<typeof detectSessionType>) {
  switch (sessionType) {
    case "push":
      return "Pull day";
    case "pull":
      return "Lower body";
    case "lower":
      return "Upper body";
    case "upper":
      return "Lower body";
    case "full_body":
      return "Upper emphasis";
    default:
      return "Balanced strength session";
  }
}

function formatSessionLabel(sessionType: ReturnType<typeof detectSessionType>) {
  switch (sessionType) {
    case "push":
      return "push work";
    case "pull":
      return "pull work";
    case "lower":
      return "lower body work";
    case "upper":
      return "upper body work";
    case "full_body":
      return "full-body work";
    default:
      return "your last session";
  }
}
