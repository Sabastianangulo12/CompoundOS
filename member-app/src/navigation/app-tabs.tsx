import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { CoachScreen } from "../screens/coach-screen";
import { CommunityScreen } from "../screens/community-screen";
import { HomeScreen } from "../screens/home-screen";
import { ProfileScreen } from "../screens/profile-screen";
import { QRScreen } from "../screens/qr-screen";
import { WorkoutsScreen } from "../screens/workouts-screen";
import type {
  CheckInRecord,
  MemberAppContext,
  MemberStats
} from "../lib/member";
import type { MemberNotification } from "../lib/notifications";
import type { WorkoutRecord, WorkoutSetInput } from "../lib/workouts";
import { colors } from "../theme";
import type { CoachMessage } from "../lib/ai-coach";
import type { CommunityPostRecord } from "../lib/community";

type AppTabsProps = {
  context: {
    memberContext: MemberAppContext | null;
    memberStats: MemberStats;
    recentCheckIns: CheckInRecord[];
    communityPosts: CommunityPostRecord[];
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
    checkInPending: boolean;
    workoutPending: boolean;
    onCheckIn: () => void;
    onCreateWorkout: (input: {
      title: string;
      performedAt?: string;
      notes?: string;
      sets: WorkoutSetInput[];
    }) => Promise<boolean>;
    onStartWorkoutFromCoach: (message: CoachMessage) => void;
    onQuickCommunityLike: (postId: string) => Promise<void>;
    onSignOut: () => void;
  };
};

const Tab = createBottomTabNavigator();

export function AppTabs({ context }: AppTabsProps) {
  if (!context.memberContext) {
    return null;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
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
          <HomeScreen
            checkInPending={context.checkInPending}
            context={context.memberContext}
            communityPosts={context.communityPosts}
            onCheckIn={context.onCheckIn}
            onQuickCommunityLike={context.onQuickCommunityLike}
            recentWorkouts={context.recentWorkouts}
            stats={context.memberStats}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Check-In">
        {() => <QRScreen context={context.memberContext} />}
      </Tab.Screen>
      <Tab.Screen name="Workouts">
        {() => (
          <WorkoutsScreen
            onCreateWorkout={context.onCreateWorkout}
            pending={context.workoutPending}
            suggestedDraft={context.coachWorkoutDraft}
            workouts={context.recentWorkouts}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Coach">
        {() => (
          <CoachScreen
            memberContext={context.memberContext}
            memberStats={context.memberStats}
            onStartWorkout={context.onStartWorkoutFromCoach}
            recentCheckIns={context.recentCheckIns}
            recentWorkouts={context.recentWorkouts}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Community">
        {() => <CommunityScreen memberContext={context.memberContext} />}
      </Tab.Screen>
      <Tab.Screen name="Profile">
        {() => (
          <ProfileScreen
            context={context.memberContext}
            notifications={context.notifications}
            onSignOut={context.onSignOut}
            pushStatusMessage={context.pushStatusMessage}
            stats={context.memberStats}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
