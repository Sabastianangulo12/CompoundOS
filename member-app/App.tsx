import { ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { AppTabs } from "./src/navigation/app-tabs";
import { LoginScreen } from "./src/screens/login-screen";
import { SignupScreen } from "./src/screens/signup-screen";
import {
  PrimaryButton,
  ScreenSurface,
  SecondaryButton
} from "./src/components/ui";
import {
  claimCurrentMemberProfile,
  createManualCheckIn,
  fetchRecentCheckIns,
  fetchCurrentMemberWithGym,
  fetchMemberStats,
  type CheckInRecord,
  type MemberAppContext,
  type MemberStats
} from "./src/lib/member";
import {
  fetchRecentNotifications,
  registerForPushNotifications,
  savePushToken,
  type MemberNotification
} from "./src/lib/notifications";
import {
  fetchCommunityFeed,
  reactToPost,
  type CommunityPostRecord
} from "./src/lib/community";
import { hasSupabaseConfig, supabase } from "./src/lib/supabase";
import {
  createWorkout,
  fetchRecentWorkouts,
  type WorkoutRecord,
  type WorkoutSetInput
} from "./src/lib/workouts";
import type { CoachMessage } from "./src/lib/ai-coach";
import { colors } from "./src/theme";

type AuthMode = "login" | "signup";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.panel,
    text: colors.text,
    border: colors.border,
    primary: colors.accent
  }
};

const emptyStats: MemberStats = {
  totalVisits: 0,
  streak: 0,
  lastCheckInAt: null
};

const emptyWorkouts: WorkoutRecord[] = [];
const emptyNotifications: MemberNotification[] = [];
const emptyCheckIns: CheckInRecord[] = [];
const emptyCommunityPosts: CommunityPostRecord[] = [];

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [memberContext, setMemberContext] = useState<MemberAppContext | null>(null);
  const [memberStats, setMemberStats] = useState<MemberStats>(emptyStats);
  const [memberLoading, setMemberLoading] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);
  const [workoutPending, setWorkoutPending] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRecord[]>(emptyWorkouts);
  const [notifications, setNotifications] = useState<MemberNotification[]>(
    emptyNotifications
  );
  const [recentCheckIns, setRecentCheckIns] = useState<CheckInRecord[]>(emptyCheckIns);
  const [communityPosts, setCommunityPosts] =
    useState<CommunityPostRecord[]>(emptyCommunityPosts);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [coachWorkoutDraft, setCoachWorkoutDraft] = useState<{
    title: string;
    notes?: string;
    sets: Array<{
      exercise: string;
      sets: number;
      reps: string;
      weight: string;
    }>;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setSessionLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthMessage(null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setMemberLoading(false);
      setMemberError(null);
      setAppNotice(null);
      setPushStatusMessage(null);
      return;
    }

    void refreshMemberData(session.user.id);
  }, [session?.user.id]);

  async function refreshMemberData(userId: string) {
    setMemberLoading(true);
    setMemberError(null);
    setAppNotice(null);

    const claimResult = await claimCurrentMemberProfile();

    if (claimResult.error) {
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setMemberError(claimResult.error.message);
      setMemberLoading(false);
      return;
    }

    const profileResult = await fetchCurrentMemberWithGym(userId);

    if (profileResult.error) {
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setMemberLoading(false);
      setMemberError(profileResult.error.message);
      return;
    }

    if (!profileResult.data) {
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setMemberError(
        "No member profile is linked to this account yet. Ask your gym to attach your member record."
      );
      setMemberLoading(false);
      return;
    }

    setMemberContext(profileResult.data);

    const [
      statsResult,
      workoutsResult,
      notificationsResult,
      checkInsResult,
      communityResult
    ] =
      await Promise.all([
        fetchMemberStats(profileResult.data.member),
        fetchRecentWorkouts(6),
        fetchRecentNotifications(12),
        fetchRecentCheckIns(profileResult.data.member, 8),
        fetchCommunityFeed()
      ]);
    const warnings: string[] = [];

    if (statsResult.error) {
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setMemberError(statsResult.error.message);
      setMemberLoading(false);
      return;
    }

    if (workoutsResult.error) {
      setMemberStats(statsResult.data);
      setRecentWorkouts(emptyWorkouts);
      warnings.push(`Workouts: ${workoutsResult.error.message}`);
    } else {
      setRecentWorkouts(workoutsResult.data ?? emptyWorkouts);
    }

    if (notificationsResult.error) {
      setNotifications(emptyNotifications);
      warnings.push(`Notifications: ${notificationsResult.error.message}`);
    } else {
      setNotifications(notificationsResult.data ?? emptyNotifications);
    }

    if (checkInsResult.error) {
      setRecentCheckIns(emptyCheckIns);
      warnings.push(`Check-ins: ${checkInsResult.error.message}`);
    } else {
      setRecentCheckIns(checkInsResult.data ?? emptyCheckIns);
    }

    if (communityResult.error) {
      setCommunityPosts(emptyCommunityPosts);
      warnings.push(`Community: ${communityResult.error.message}`);
    } else {
      setCommunityPosts(communityResult.data ?? emptyCommunityPosts);
    }

    setMemberStats(statsResult.data);
    setAppNotice(warnings.length > 0 ? warnings.join(" | ") : null);
    setMemberLoading(false);
  }

  useEffect(() => {
    if (!memberContext) {
      return;
    }

    let isMounted = true;

    async function setupPushToken() {
      const registration = await registerForPushNotifications();

      if (!isMounted) {
        return;
      }

      if (registration.error) {
        setPushStatusMessage(registration.error.message);
        return;
      }

      if (!registration.token) {
        setPushStatusMessage("Push notifications are unavailable on this device.");
        return;
      }

      const saveResult = await savePushToken(registration.token);

      if (!isMounted) {
        return;
      }

      if (saveResult.error) {
        setPushStatusMessage(saveResult.error.message);
        return;
      }

      setPushStatusMessage("Push notifications enabled on this device.");
    }

    void setupPushToken();

    return () => {
      isMounted = false;
    };
  }, [memberContext?.member.id]);

  async function handleLogin(email: string, password: string) {
    setAuthPending(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setAuthPending(false);

    if (error) {
      setAuthMessage(error.message);
    }
  }

  async function handleSignup(fullName: string, email: string, password: string) {
    setAuthPending(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    setAuthPending(false);

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage(
      "Account created. On first sign-in, we'll link this login to your member profile if your gym already has your email on file."
    );
    setAuthMode("login");
  }

  async function handleCheckIn() {
    if (!memberContext) {
      return;
    }

    setCheckInPending(true);
    const result = await createManualCheckIn(memberContext.member);
    setCheckInPending(false);

    if (result.error) {
      Alert.alert("Check-in failed", result.error.message);
      return;
    }

    if (session?.user.id) {
      await refreshMemberData(session.user.id);
    }

    Alert.alert("Checked in", "Your visit has been recorded.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function handleCreateWorkout(input: {
    title: string;
    performedAt?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  }) {
    setWorkoutPending(true);
    const result = await createWorkout(input);
    setWorkoutPending(false);

    if (result.error) {
      Alert.alert("Workout not saved", result.error.message);
      return false;
    }

    if (session?.user.id) {
      await refreshMemberData(session.user.id);
    }

    Alert.alert("Workout saved", "Your workout has been logged.");
    setCoachWorkoutDraft(null);
    return true;
  }

  async function handleQuickCommunityLike(postId: string) {
    const result = await reactToPost(postId, "🔥");

    if (result.error) {
      Alert.alert("Reaction failed", result.error.message);
      return;
    }

    const communityResult = await fetchCommunityFeed();

    if (communityResult.error) {
      Alert.alert("Community refresh failed", communityResult.error.message);
      return;
    }

    setCommunityPosts(communityResult.data ?? emptyCommunityPosts);
  }

  function handleStartWorkoutFromCoach(message: CoachMessage) {
    if (!message.recommendation?.suggested_workout.length) {
      return;
    }

    setCoachWorkoutDraft({
      title: `${message.recommendation.focus} session`,
      notes: message.recommendation.message,
      sets: message.recommendation.suggested_workout
    });
  }

  const appContext = useMemo(
    () => ({
      memberContext,
      memberStats,
      recentCheckIns,
      notifications,
      communityPosts,
      pushStatusMessage,
      recentWorkouts,
      coachWorkoutDraft,
      checkInPending,
      workoutPending,
      onCheckIn: handleCheckIn,
      onCreateWorkout: handleCreateWorkout,
      onStartWorkoutFromCoach: handleStartWorkoutFromCoach,
      onQuickCommunityLike: handleQuickCommunityLike,
      onSignOut: handleLogout
    }),
    [
      checkInPending,
      memberContext,
      memberStats,
      recentCheckIns,
      notifications,
      communityPosts,
      pushStatusMessage,
      recentWorkouts,
      coachWorkoutDraft,
      workoutPending
    ]
  );

  if (!hasSupabaseConfig) {
    return (
      <SafeAreaProvider>
        <ScreenSurface>
          <StatusBar style="light" />
          <CenteredState
            title="Supabase config missing"
            body="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY before running the member app."
          />
        </ScreenSurface>
      </SafeAreaProvider>
    );
  }

  if (sessionLoading) {
    return (
      <SafeAreaProvider>
        <ScreenSurface>
          <StatusBar style="light" />
          <CenteredLoading label="Loading member app" />
        </ScreenSurface>
      </SafeAreaProvider>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <ScreenSurface>
          <StatusBar style="light" />
          {authMode === "login" ? (
            <LoginScreen
              message={authMessage}
              pending={authPending}
              onLogin={handleLogin}
              onSwitchToSignup={() => {
                setAuthMessage(null);
                setAuthMode("signup");
              }}
            />
          ) : (
            <SignupScreen
              message={authMessage}
              pending={authPending}
              onSignup={handleSignup}
              onSwitchToLogin={() => {
                setAuthMessage(null);
                setAuthMode("login");
              }}
            />
          )}
        </ScreenSurface>
      </SafeAreaProvider>
    );
  }

  if (memberLoading) {
    return (
      <SafeAreaProvider>
        <ScreenSurface>
          <StatusBar style="light" />
          <CenteredLoading label="Loading your gym context" />
        </ScreenSurface>
      </SafeAreaProvider>
    );
  }

  if (!memberContext) {
    return (
      <SafeAreaProvider>
        <ScreenSurface>
          <StatusBar style="light" />
          <CenteredState
            title="No membership found"
            body={memberError ?? "No member profile is linked to this account yet."}
            footer={
              <View style={{ gap: 12 }}>
                <SecondaryButton
                  label="Try again"
                  onPress={() => {
                    if (session?.user.id) {
                      void refreshMemberData(session.user.id);
                    }
                  }}
                />
                <PrimaryButton
                  label="Sign out"
                  onPress={() => {
                    void handleLogout();
                  }}
                />
              </View>
            }
          />
        </ScreenSurface>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" />
          <AppTabs context={appContext} />
        </NavigationContainer>
        {appNotice ? (
          <View
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: 20,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel,
              paddingHorizontal: 16,
              paddingVertical: 14
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
              {appNotice}
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

function CenteredLoading({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.muted, fontSize: 15 }}>{label}</Text>
    </View>
  );
}

function CenteredState({
  title,
  body,
  footer
}: {
  title: string;
  body: string;
  footer?: ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 24,
          gap: 12
        }}
      >
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
          {body}
        </Text>
        {footer ? <View style={{ marginTop: 8 }}>{footer}</View> : null}
      </View>
    </View>
  );
}
