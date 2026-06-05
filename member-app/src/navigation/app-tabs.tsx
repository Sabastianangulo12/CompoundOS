import { ReactNode, useMemo, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useIsFocused } from "@react-navigation/native";
import { Platform, Pressable, Text, View } from "react-native";
import { CommunityScreen } from "../screens/community-screen";
import { HomeScreen } from "../screens/home-screen";
import { ProfileScreen } from "../screens/profile-screen";
import { ScheduleScreen } from "../screens/schedule-screen";
import { TrainingScreen } from "../screens/training-screen";
import { WalletScreen } from "../screens/wallet-screen";
import type {
  CheckInRecord,
  MemberAppContext,
  MemberStats
} from "../lib/member";
import type { MemberNotification } from "../lib/notifications";
import type { GymAnnouncementRecord } from "../lib/news";
import type { WorkoutRecord, WorkoutSetInput } from "../lib/workouts";
import { colors } from "../theme";
import type { CoachMessage } from "../lib/ai-coach";
import type { CommunityPostRecord, FriendStepLeader } from "../lib/community";
import type {
  GymChallengeRecord,
  GymMemberSpotlightRecord,
  GymShoutoutRecord
} from "../lib/culture";

type AppTabsProps = {
  context: {
    memberContext: MemberAppContext;
    memberStats: MemberStats;
    recentCheckIns: CheckInRecord[];
    communityPosts: CommunityPostRecord[];
    friendStepLeaders: FriendStepLeader[];
    announcements: GymAnnouncementRecord[];
    challenges: GymChallengeRecord[];
    shoutouts: GymShoutoutRecord[];
    spotlights: GymMemberSpotlightRecord[];
    dailyStepGoal: number;
    notifications: MemberNotification[];
    pushStatusMessage: string | null;
    recentWorkouts: WorkoutRecord[];
    coachWorkoutDraft: {
      title: string;
      notes?: string;
      sets: Array<{
        exercise: string;
        sets: number;
        reps: string;
        weight: string;
      }>;
    } | null;
    workoutPending: boolean;
    onCreateWorkout: (input: {
      title: string;
      performedAt?: string;
      notes?: string;
      sets: WorkoutSetInput[];
    }) => Promise<boolean>;
    onStartWorkoutFromCoach: (message: CoachMessage) => void;
    onQuickCommunityLike: (postId: string) => Promise<void>;
    onUpdateDailyStepGoal: (nextGoal: number) => Promise<void>;
    onMarkNotificationRead: (notificationId: string) => Promise<void>;
    onMarkAllNotificationsRead: () => Promise<void>;
    onSignOut: () => void;
  };
};

const Tab = createBottomTabNavigator();
const webTabOrder = [
  "Home",
  "Schedule",
  "Training",
  "Wallet",
  "Community",
  "Profile"
] as const;
type WebTabKey = (typeof webTabOrder)[number];

function FocusedTabScreen({ children }: { children: ReactNode }) {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <>{children}</>;
}

export function AppTabs({ context }: AppTabsProps) {
  if (!context.memberContext) {
    return null;
  }

  const unreadNotificationCount = context.notifications.filter(
    (notification) => !notification.read_at
  ).length;

  if (Platform.OS === "web") {
    return (
      <WebAppTabs
        context={context}
        unreadNotificationCount={unreadNotificationCount}
      />
    );
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarIcon: () => null,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          height: 74,
          paddingBottom: 10,
          paddingTop: 10
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: {
          backgroundColor: colors.background
        }
      }}
    >
      <Tab.Screen name="Home">
        {() => (
          <FocusedTabScreen>
            <HomeScreen
              context={context.memberContext}
              announcements={context.announcements}
              challenges={context.challenges}
              dailyStepGoal={context.dailyStepGoal}
              friendStepLeaders={context.friendStepLeaders}
              recentCheckIns={context.recentCheckIns}
              recentWorkouts={context.recentWorkouts}
              stats={context.memberStats}
            />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="Training">
        {() => (
          <FocusedTabScreen>
            <TrainingScreen
              memberContext={context.memberContext}
              memberStats={context.memberStats}
              onCreateWorkout={context.onCreateWorkout}
              pending={context.workoutPending}
              suggestedDraft={context.coachWorkoutDraft}
              onStartWorkout={context.onStartWorkoutFromCoach}
              recentCheckIns={context.recentCheckIns}
              recentWorkouts={context.recentWorkouts}
            />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="Schedule">
        {() => (
          <FocusedTabScreen>
            <ScheduleScreen />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="Wallet">
        {() => (
          <FocusedTabScreen>
            <WalletScreen memberContext={context.memberContext} />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="Community">
        {() => (
          <FocusedTabScreen>
            <CommunityScreen
              memberContext={context.memberContext}
              shoutouts={context.shoutouts}
              spotlights={context.spotlights}
            />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          tabBarBadge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined
        }}
      >
        {() => (
          <FocusedTabScreen>
            <ProfileScreen
              context={context.memberContext}
              dailyStepGoal={context.dailyStepGoal}
              notifications={context.notifications}
              onUpdateDailyStepGoal={context.onUpdateDailyStepGoal}
              onMarkAllNotificationsRead={context.onMarkAllNotificationsRead}
              onMarkNotificationRead={context.onMarkNotificationRead}
              onSignOut={context.onSignOut}
              pushStatusMessage={context.pushStatusMessage}
            />
          </FocusedTabScreen>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function WebAppTabs({
  context,
  unreadNotificationCount
}: {
  context: AppTabsProps["context"];
  unreadNotificationCount: number;
}) {
  const [activeTab, setActiveTab] = useState<WebTabKey>("Home");

  const content = useMemo(() => {
    switch (activeTab) {
      case "Schedule":
        return <ScheduleScreen />;
      case "Training":
        return (
          <TrainingScreen
            memberContext={context.memberContext}
            memberStats={context.memberStats}
            onCreateWorkout={context.onCreateWorkout}
            pending={context.workoutPending}
            suggestedDraft={context.coachWorkoutDraft}
            onStartWorkout={context.onStartWorkoutFromCoach}
            recentCheckIns={context.recentCheckIns}
            recentWorkouts={context.recentWorkouts}
          />
        );
      case "Wallet":
        return <WalletScreen memberContext={context.memberContext} />;
      case "Community":
        return (
          <CommunityScreen
            memberContext={context.memberContext}
            shoutouts={context.shoutouts}
            spotlights={context.spotlights}
          />
        );
      case "Profile":
        return (
          <ProfileScreen
            context={context.memberContext}
            dailyStepGoal={context.dailyStepGoal}
            notifications={context.notifications}
            onUpdateDailyStepGoal={context.onUpdateDailyStepGoal}
            onMarkAllNotificationsRead={context.onMarkAllNotificationsRead}
            onMarkNotificationRead={context.onMarkNotificationRead}
            onSignOut={context.onSignOut}
            pushStatusMessage={context.pushStatusMessage}
          />
        );
      case "Home":
      default:
        return (
          <HomeScreen
            context={context.memberContext}
            announcements={context.announcements}
            challenges={context.challenges}
            dailyStepGoal={context.dailyStepGoal}
            friendStepLeaders={context.friendStepLeaders}
            recentCheckIns={context.recentCheckIns}
            recentWorkouts={context.recentWorkouts}
            stats={context.memberStats}
          />
        );
    }
  }, [activeTab, context]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 18,
          paddingBottom: 12
        }}
      >
        <View
          style={{
            borderRadius: 28,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            paddingHorizontal: 18,
            paddingVertical: 18,
            gap: 8
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 11,
              fontWeight: "800",
              letterSpacing: 2,
              textTransform: "uppercase"
            }}
          >
            Member club app
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "800"
                }}
              >
                {`${context.memberContext.member.first_name}'s dashboard`}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 13,
                  marginTop: 4
                }}
              >
                Training, wallet, community, and membership in one place.
              </Text>
            </View>
            {unreadNotificationCount > 0 ? (
              <View
                style={{
                  minWidth: 42,
                  height: 42,
                  borderRadius: 999,
                  backgroundColor: colors.panelElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 10
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "800"
                  }}
                >
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }}>{content}</View>
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 16
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            padding: 8
          }}
        >
          {webTabOrder.map((tabName) => {
            const isActive = tabName === activeTab;
            const showBadge = tabName === "Profile" && unreadNotificationCount > 0;

            return (
              <Pressable
                key={tabName}
                onPress={() => setActiveTab(tabName)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                  backgroundColor: isActive ? colors.panelElevated : colors.panel,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{
                      color: isActive ? colors.text : colors.muted,
                      fontSize: 13,
                      fontWeight: isActive ? "700" : "600"
                    }}
                  >
                    {tabName}
                  </Text>
                  {showBadge ? (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 999,
                        backgroundColor: colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 6
                      }}
                    >
                      <Text
                        style={{
                          color: colors.background,
                          fontSize: 11,
                          fontWeight: "800"
                        }}
                      >
                        {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
