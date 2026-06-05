import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { Alert, ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
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
  type CheckInRecord,
  type MemberAppContext,
  type MemberStats
} from "./src/lib/member";
import { fetchMemberAppBootstrap } from "./src/lib/bootstrap";
import {
  fetchRecentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerForPushNotifications,
  savePushToken,
  type MemberNotification
} from "./src/lib/notifications";
import {
  type GymAnnouncementRecord
} from "./src/lib/news";
import {
  fetchCommunityFeed,
  fetchFriendStepLeaderboard,
  reactToPost,
  type CommunityPostRecord,
  type FriendStepLeader
} from "./src/lib/community";
import {
  fetchActiveChallenges,
  fetchActiveSpotlights,
  fetchRecentShoutouts,
  type GymChallengeRecord,
  type GymMemberSpotlightRecord,
  type GymShoutoutRecord
} from "./src/lib/culture";
import { hasSupabaseConfig, supabase } from "./src/lib/supabase";
import {
  createWorkout,
  fetchRecentWorkouts,
  type WorkoutRecord,
  type WorkoutSetInput
} from "./src/lib/workouts";
import { syncMemberBillingState } from "./src/lib/billing";
import type { CoachMessage } from "./src/lib/ai-coach";
import {
  defaultDailyStepGoal,
  loadDailyStepGoal,
  saveDailyStepGoal
} from "./src/lib/settings";
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
const emptyFriendLeaders: FriendStepLeader[] = [];
const emptyAnnouncements: GymAnnouncementRecord[] = [];
const emptyChallenges: GymChallengeRecord[] = [];
const emptyShoutouts: GymShoutoutRecord[] = [];
const emptySpotlights: GymMemberSpotlightRecord[] = [];
const memberLoadWarningThresholdMs = 12000;

function mergeAppNotice(currentNotice: string | null, nextNotice: string) {
  if (!nextNotice.trim()) {
    return currentNotice;
  }

  if (currentNotice?.includes(nextNotice)) {
    return currentNotice;
  }

  return currentNotice ? `${currentNotice} | ${nextNotice}` : nextNotice;
}

function isIgnorableBackgroundNotice(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("network request failed") ||
    normalized.includes("timed out")
  );
}

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return {
      error
    };
  }

  componentDidCatch(error: Error) {
    console.error("Member app runtime error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaProvider>
          <ScreenSurface>
            <StatusBar style="light" />
            <CenteredState
              title="App failed to load"
              body={
                this.state.error.message ||
                "A runtime error interrupted startup."
              }
            />
          </ScreenSurface>
        </SafeAreaProvider>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [memberContext, setMemberContext] = useState<MemberAppContext | null>(null);
  const [memberStats, setMemberStats] = useState<MemberStats>(emptyStats);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberLoadingWarning, setMemberLoadingWarning] = useState(false);
  const [authPending, setAuthPending] = useState(false);
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
  const [friendStepLeaders, setFriendStepLeaders] =
    useState<FriendStepLeader[]>(emptyFriendLeaders);
  const [announcements, setAnnouncements] =
    useState<GymAnnouncementRecord[]>(emptyAnnouncements);
  const [challenges, setChallenges] = useState<GymChallengeRecord[]>(emptyChallenges);
  const [shoutouts, setShoutouts] = useState<GymShoutoutRecord[]>(emptyShoutouts);
  const [spotlights, setSpotlights] =
    useState<GymMemberSpotlightRecord[]>(emptySpotlights);
  const [dailyStepGoal, setDailyStepGoal] = useState(defaultDailyStepGoal);
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
    void loadDailyStepGoal().then((goal) => {
      setDailyStepGoal(goal);
    });
  }, []);

  const refreshMemberData = useCallback(async (_userId: string) => {
    try {
      setMemberLoading(true);
      setMemberError(null);
      setAppNotice(null);

      let bootstrapResult = await fetchMemberAppBootstrap();

      if (!bootstrapResult.error && !bootstrapResult.data) {
        const claimResult = await claimCurrentMemberProfile();

        if (claimResult.error) {
          setMemberContext(null);
          setMemberStats(emptyStats);
          setRecentWorkouts(emptyWorkouts);
          setNotifications(emptyNotifications);
          setRecentCheckIns(emptyCheckIns);
          setCommunityPosts(emptyCommunityPosts);
          setFriendStepLeaders(emptyFriendLeaders);
          setAnnouncements(emptyAnnouncements);
          setChallenges(emptyChallenges);
          setShoutouts(emptyShoutouts);
          setSpotlights(emptySpotlights);
          setMemberError(claimResult.error.message);
          setMemberLoading(false);
          return;
        }

        bootstrapResult = await fetchMemberAppBootstrap();
      }

      if (bootstrapResult.error) {
        setMemberContext(null);
        setMemberStats(emptyStats);
        setRecentWorkouts(emptyWorkouts);
        setNotifications(emptyNotifications);
        setRecentCheckIns(emptyCheckIns);
        setCommunityPosts(emptyCommunityPosts);
        setFriendStepLeaders(emptyFriendLeaders);
        setAnnouncements(emptyAnnouncements);
        setChallenges(emptyChallenges);
        setShoutouts(emptyShoutouts);
        setSpotlights(emptySpotlights);
        setMemberLoading(false);
        setMemberError(bootstrapResult.error.message);
        return;
      }

      if (!bootstrapResult.data) {
        setMemberContext(null);
        setMemberStats(emptyStats);
        setRecentWorkouts(emptyWorkouts);
        setNotifications(emptyNotifications);
        setRecentCheckIns(emptyCheckIns);
        setCommunityPosts(emptyCommunityPosts);
        setFriendStepLeaders(emptyFriendLeaders);
        setAnnouncements(emptyAnnouncements);
        setChallenges(emptyChallenges);
        setShoutouts(emptyShoutouts);
        setSpotlights(emptySpotlights);
        setMemberError(
          "No member profile is linked to this account yet. Ask your gym to attach your member record."
        );
        setMemberLoading(false);
        return;
      }

      const activeContext = bootstrapResult.data.context;
      setMemberContext(activeContext);
      setMemberStats(bootstrapResult.data.stats);
      setNotifications(bootstrapResult.data.notifications);
      setRecentCheckIns(bootstrapResult.data.recentCheckIns);
      setAnnouncements(bootstrapResult.data.announcements);

      setAppNotice(null);
      setMemberLoading(false);

      void syncMemberBillingState().then((billingSyncResult) => {
        if (billingSyncResult.error) {
          if (
            Platform.OS === "web" &&
            isIgnorableBackgroundNotice(billingSyncResult.error.message)
          ) {
            return;
          }

          setAppNotice((currentNotice) => {
            const billingNotice = `Billing sync: ${billingSyncResult.error.message}`;
            return mergeAppNotice(currentNotice, billingNotice);
          });
        }
      });

      void (async () => {
        const [
          workoutsResult,
          communityResult,
          friendLeaderboardResult,
          challengesResult,
          shoutoutsResult,
          spotlightsResult
        ] = await Promise.all([
          fetchRecentWorkouts(36),
          fetchCommunityFeed(),
          fetchFriendStepLeaderboard(5),
          fetchActiveChallenges(activeContext.member.gym_id),
          fetchRecentShoutouts(activeContext.member.gym_id),
          fetchActiveSpotlights(activeContext.member.gym_id)
        ]);

        const deferredWarnings: string[] = [];

        if (workoutsResult.error) {
          setRecentWorkouts(emptyWorkouts);
          deferredWarnings.push(`Workouts: ${workoutsResult.error.message}`);
        } else {
          setRecentWorkouts(workoutsResult.data ?? emptyWorkouts);
        }

        if (communityResult.error) {
          setCommunityPosts(emptyCommunityPosts);
          deferredWarnings.push(`Community: ${communityResult.error.message}`);
        } else {
          setCommunityPosts(communityResult.data ?? emptyCommunityPosts);
        }

        if (friendLeaderboardResult.error) {
          setFriendStepLeaders(emptyFriendLeaders);
          deferredWarnings.push(
            `Leaderboard: ${friendLeaderboardResult.error.message}`
          );
        } else {
          setFriendStepLeaders(
            friendLeaderboardResult.data ?? emptyFriendLeaders
          );
        }

        if (challengesResult.error) {
          setChallenges(emptyChallenges);
          deferredWarnings.push(`Challenges: ${challengesResult.error.message}`);
        } else {
          setChallenges(challengesResult.data ?? emptyChallenges);
        }

        if (shoutoutsResult.error) {
          setShoutouts(emptyShoutouts);
          deferredWarnings.push(`Shoutouts: ${shoutoutsResult.error.message}`);
        } else {
          setShoutouts(shoutoutsResult.data ?? emptyShoutouts);
        }

        if (spotlightsResult.error) {
          setSpotlights(emptySpotlights);
          deferredWarnings.push(`Spotlights: ${spotlightsResult.error.message}`);
        } else {
          setSpotlights(spotlightsResult.data ?? emptySpotlights);
        }

        if (deferredWarnings.length > 0) {
          setAppNotice((currentNotice) =>
            mergeAppNotice(currentNotice, deferredWarnings.join(" | "))
          );
        }
      })().catch((error) => {
        console.error("Deferred member app refresh failed", error);
        setAppNotice((currentNotice) =>
          mergeAppNotice(
            currentNotice,
            error instanceof Error
              ? error.message
              : "Deferred member content could not finish loading."
          )
        );
      });

      return;
    } catch (error) {
      console.error("Failed to refresh member app context", error);
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setFriendStepLeaders(emptyFriendLeaders);
      setAnnouncements(emptyAnnouncements);
      setChallenges(emptyChallenges);
      setShoutouts(emptyShoutouts);
      setSpotlights(emptySpotlights);
      setMemberError(
        error instanceof Error
          ? error.message
          : "A startup error interrupted loading your member app."
      );
      setMemberLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setMemberContext(null);
      setMemberStats(emptyStats);
      setRecentWorkouts(emptyWorkouts);
      setNotifications(emptyNotifications);
      setRecentCheckIns(emptyCheckIns);
      setCommunityPosts(emptyCommunityPosts);
      setFriendStepLeaders(emptyFriendLeaders);
      setAnnouncements(emptyAnnouncements);
      setChallenges(emptyChallenges);
      setShoutouts(emptyShoutouts);
      setSpotlights(emptySpotlights);
      setMemberLoading(false);
      setMemberLoadingWarning(false);
      setMemberError(null);
      setAppNotice(null);
      setPushStatusMessage(null);
      return;
    }

    void refreshMemberData(session.user.id);
  }, [refreshMemberData, session?.user.id]);

  useEffect(() => {
    if (!memberLoading) {
      setMemberLoadingWarning(false);
      return;
    }

    const timeout = setTimeout(() => {
      setMemberLoadingWarning(true);
    }, memberLoadWarningThresholdMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [memberLoading]);

  useEffect(() => {
    if (!memberContext) {
      return;
    }

    let isMounted = true;

    async function setupPushToken() {
      try {
        const registration = await registerForPushNotifications();

        if (!isMounted) {
          return;
        }

        if (registration.error) {
          setPushStatusMessage(registration.error.message);
          return;
        }

        if (registration.supported === false) {
          setPushStatusMessage(null);
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
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPushStatusMessage(
          error instanceof Error
            ? error.message
            : "Push notifications could not be enabled on this device."
        );
      }
    }

    void setupPushToken();

    return () => {
      isMounted = false;
    };
  }, [memberContext, memberContext?.member.id]);

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

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const handleCreateWorkout = useCallback(async (input: {
    title: string;
    performedAt?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  }) => {
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
  }, [refreshMemberData, session?.user.id]);

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

  async function handleUpdateDailyStepGoal(nextGoal: number) {
    const savedGoal = await saveDailyStepGoal(nextGoal);
    setDailyStepGoal(savedGoal);
  }

  const refreshNotifications = useCallback(async () => {
    const result = await fetchRecentNotifications(12);

    if (result.error) {
      setAppNotice((current) =>
        [current, `Notifications: ${result.error?.message}`].filter(Boolean).join(" | ")
      );
      return;
    }

    setNotifications(result.data ?? emptyNotifications);
  }, []);

  const handleMarkNotificationRead = useCallback(async (notificationId: string) => {
    const result = await markNotificationRead(notificationId);

    if (result.error) {
      Alert.alert("Notification update failed", result.error.message);
      return;
    }

    await refreshNotifications();
  }, [refreshNotifications]);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const result = await markAllNotificationsRead();

    if (result.error) {
      Alert.alert("Notification update failed", result.error.message);
      return;
    }

    await refreshNotifications();
  }, [refreshNotifications]);

  const appContext = useMemo(
    () => ({
      memberContext,
      memberStats,
      recentCheckIns,
      notifications,
      communityPosts,
      friendStepLeaders,
      announcements,
      challenges,
      shoutouts,
      spotlights,
      dailyStepGoal,
      pushStatusMessage,
      recentWorkouts,
      coachWorkoutDraft,
      workoutPending,
      onCreateWorkout: handleCreateWorkout,
      onStartWorkoutFromCoach: handleStartWorkoutFromCoach,
      onQuickCommunityLike: handleQuickCommunityLike,
      onUpdateDailyStepGoal: handleUpdateDailyStepGoal,
      onMarkNotificationRead: handleMarkNotificationRead,
      onMarkAllNotificationsRead: handleMarkAllNotificationsRead,
      onSignOut: handleLogout
    }),
    [
      memberContext,
      memberStats,
      recentCheckIns,
      notifications,
      communityPosts,
      friendStepLeaders,
      announcements,
      challenges,
      shoutouts,
      spotlights,
      dailyStepGoal,
      pushStatusMessage,
      recentWorkouts,
      coachWorkoutDraft,
      workoutPending,
      handleCreateWorkout,
      handleMarkNotificationRead,
      handleMarkAllNotificationsRead
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
    if (memberLoadingWarning) {
      return (
        <SafeAreaProvider>
          <ScreenSurface>
            <StatusBar style="light" />
            <CenteredState
              title="Still loading your gym"
              body={
                Platform.OS === "web"
                  ? "Your web session is taking longer than expected to restore. Try reloading once or retry member startup below."
                  : "Your member session is taking longer than expected. Try member startup again."
              }
              footer={
                <View style={{ gap: 12 }}>
                  <SecondaryButton
                    label="Retry member startup"
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
    <AppErrorBoundary>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <NavigationContainer theme={navigationTheme}>
            <StatusBar style="light" />
            <AppTabs
              context={{
                ...appContext,
                memberContext
              }}
            />
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
              <Pressable
                onPress={() => setAppNotice(null)}
                style={{ position: "absolute", right: 10, top: 10, padding: 6 }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Close</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

function CenteredLoading({ label }: { label: string }) {
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
          borderRadius: 30,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          paddingHorizontal: 24,
          paddingVertical: 30,
          alignItems: "center",
          gap: 16
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            backgroundColor: colors.panelElevated,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <ActivityIndicator color={colors.accent} />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "700",
            textAlign: "center"
          }}
        >
          Getting your club ready
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 15,
            textAlign: "center",
            lineHeight: 22
          }}
        >
          {label}
        </Text>
      </View>
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
          borderRadius: 30,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 24,
          gap: 12,
          shadowColor: "#000000",
          shadowOpacity: 0.22,
          shadowOffset: { width: 0, height: 18 },
          shadowRadius: 40
        }}
      >
        <View
          style={{
            width: 44,
            height: 5,
            borderRadius: 999,
            backgroundColor: colors.accent,
            opacity: 0.9
          }}
        />
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
