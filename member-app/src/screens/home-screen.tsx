import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  ScreenScroll,
  SectionTitle,
  TextField
} from "../components/ui";
import type {
  CheckInRecord,
  MemberAppContext,
  MemberStats
} from "../lib/member";
import type { FriendStepLeader } from "../lib/community";
import type { GymAnnouncementRecord } from "../lib/news";
import {
  createEmptyPersonalRecord,
  loadPersonalRecords,
  savePersonalRecords,
  type PersonalRecordEntry
} from "../lib/prs";
import { buildMemberQrValue } from "../lib/member-qr";
import type { WorkoutRecord } from "../lib/workouts";
import type { GymChallengeRecord } from "../lib/culture";
import {
  formatCount,
  formatDateTime,
  formatMonthDay,
  formatShortMonth,
  formatWeekdayNarrow
} from "../lib/format";
import { colors } from "../theme";

type StepRange = "week" | "month" | "year";

const STEP_RANGE_OPTIONS: Array<{ label: string; value: StepRange }> = [
  { label: "Day", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" }
];

export function HomeScreen({
  announcements,
  challenges,
  context,
  dailyStepGoal,
  friendStepLeaders,
  recentCheckIns,
  stats,
  recentWorkouts
}: {
  announcements: GymAnnouncementRecord[];
  challenges: GymChallengeRecord[];
  context: MemberAppContext;
  dailyStepGoal: number;
  friendStepLeaders: FriendStepLeader[];
  recentCheckIns: CheckInRecord[];
  stats: MemberStats;
  recentWorkouts: WorkoutRecord[];
}) {
  const firstName = context.member.first_name;
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [stepRange, setStepRange] = useState<StepRange>("week");
  const [personalRecords, setPersonalRecords] = useState<PersonalRecordEntry[]>([
    createEmptyPersonalRecord(1)
  ]);
  const memberQrValue = buildMemberQrValue(context.member.id, context.gym?.id);
  const stepTrend = buildStepTrend(recentCheckIns, recentWorkouts, stepRange);
  const stepTotal = stepTrend.reduce((sum, period) => sum + period.steps, 0);
  const graphPeak = Math.max(...stepTrend.map((period) => period.steps), 1);
  const goalStreak = calculateGoalStepStreak(
    recentCheckIns,
    recentWorkouts,
    dailyStepGoal
  );
  const visitTrend = buildMonthlyVisitTrend(recentCheckIns);
  const visitGraphPeak = Math.max(...visitTrend.map((period) => period.count), 1);
  const currentMonthVisits = visitTrend[visitTrend.length - 1]?.count ?? 0;

  useEffect(() => {
    void loadPersonalRecords().then((records) => {
      setPersonalRecords(
        records.length > 0
          ? records
          : [createEmptyPersonalRecord(1)]
      );
    });
  }, []);

  return (
    <ScreenScroll>
      <SectionTitle
        title={`Hey, ${firstName}`}
        subtitle={`${context.gym?.name ?? "The Compound"} | ${formatStatus(context.member.status)}`}
      />

      <Card>
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Ready for today&apos;s session?
        </Text>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>
          Open your check-in QR
        </Text>
        <PrimaryButton label="Show QR Code" onPress={() => setIsQrOpen(true)} />
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
          Challenges
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          Active gym challenges
        </Text>
        {challenges.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
            No active challenges right now. When your gym launches steps, visit, or workout competitions, they will show here.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {challenges.map((challenge) => {
              const progress = getChallengeProgress(
                challenge,
                recentCheckIns,
                recentWorkouts,
                stepTotal
              );
              const completion = Math.min(progress.current / challenge.goal_value, 1);
              return (
                <View
                  key={challenge.id}
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
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 }}>
                      {challenge.title}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {challenge.period}
                    </Text>
                  </View>
                  {challenge.description ? (
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                      {challenge.description}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: colors.border,
                      overflow: "hidden"
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.max(8, completion * 100)}%`,
                        height: "100%",
                        backgroundColor: colors.accent
                      }}
                    />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                    {formatChallengeValue(challenge.metric_type, progress.current)} /{" "}
                    {formatChallengeValue(challenge.metric_type, challenge.goal_value)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
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
          Gym news
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          Updates from {context.gym?.name ?? "your gym"}
        </Text>
        {announcements.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
            No gym news has been posted yet. When your club shares schedule changes,
            event notes, or member memos, they will show up here.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {announcements.map((announcement) => (
              <View
                key={announcement.id}
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
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "700",
                      flex: 1
                    }}
                  >
                    {announcement.title}
                  </Text>
                  {announcement.is_pinned ? (
                    <View
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.accent,
                        backgroundColor: colors.panel,
                        paddingHorizontal: 10,
                        paddingVertical: 5
                      }}
                    >
                      <Text
                        style={{
                          color: colors.accent,
                          fontSize: 11,
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: 0.8
                        }}
                      >
                        Pinned
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
                  {announcement.body}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {formatDateTime(announcement.created_at)}
                </Text>
              </View>
            ))}
          </View>
        )}
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
          Highlights
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          {context.member.first_name} stats
        </Text>
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panelElevated,
            padding: 18,
            gap: 16
          }}
        >
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              padding: 16,
              gap: 16
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 16
              }}
            >
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                  color: colors.text,
                  fontSize: 32,
                  fontWeight: "700"
                }}
              >
                  {formatStepCount(stepTotal)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  {getRangeSummaryLabel(stepRange)}
                </Text>
              </View>
              <View
                style={{
                  alignItems: "flex-end",
                  gap: 4
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Goal streak
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 20,
                    fontWeight: "700"
                  }}
                >
                  {goalStreak} day{goalStreak === 1 ? "" : "s"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {STEP_RANGE_OPTIONS.map((option) => {
                const isActive = option.value === stepRange;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setStepRange(option.value)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent : colors.border,
                      backgroundColor: isActive ? colors.panelElevated : colors.panel,
                      paddingHorizontal: 12,
                      paddingVertical: 8
                    }}
                  >
                    <Text
                      style={{
                        color: isActive ? colors.text : colors.muted,
                        fontSize: 12,
                        fontWeight: "700"
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                height: 164,
                gap: 10
              }}
            >
              {stepTrend.map((day) => {
                const height = Math.max(
                  (day.steps / graphPeak) * 110,
                  day.steps > 0 ? 16 : 8
                );

                return (
                  <View
                    key={day.key}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 8
                    }}
                  >
                    <Text
                    style={{
                        color: day.isCurrent ? colors.text : colors.muted,
                        fontSize: 12,
                        fontWeight: day.isCurrent ? "700" : "500"
                      }}
                    >
                      {formatCompactSteps(day.steps)}
                    </Text>
                    <View
                      style={{
                        width: "100%",
                        maxWidth: 28,
                        height,
                      minHeight: 8,
                      borderRadius: 999,
                      backgroundColor: day.steps > 0
                          ? day.isCurrent
                            ? colors.text
                            : colors.accent
                          : colors.border
                      }}
                    />
                    <Text
                    style={{
                        color: day.isCurrent ? colors.text : colors.muted,
                        fontSize: 12,
                        fontWeight: day.isCurrent ? "700" : "500"
                      }}
                    >
                      {day.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              A simple step view inspired by Apple Health. Your streak tracks days
              where you hit your saved goal of {formatStepCount(dailyStepGoal)} steps.
            </Text>

            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: "600"
                }}
              >
                Friends leaderboard
              </Text>
              {friendStepLeaders.length === 0 ? (
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.panel,
                    paddingHorizontal: 14,
                    paddingVertical: 12
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                    Add friends in Community to see today&apos;s top step leaders here.
                  </Text>
                </View>
              ) : (
                friendStepLeaders.map((leader) => (
                  <View
                    key={leader.member_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.panel,
                      paddingHorizontal: 14,
                      paddingVertical: 12
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        flex: 1
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor:
                            leader.rank === 1 ? colors.accent : colors.background,
                          borderWidth: 1,
                          borderColor:
                            leader.rank === 1 ? colors.accent : colors.border
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 13,
                            fontWeight: "700"
                          }}
                        >
                          {leader.rank}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 14,
                            fontWeight: "600"
                          }}
                        >
                          {leader.first_name} {leader.last_name}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>
                          Today&apos;s estimated steps
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "700"
                      }}
                    >
                      {formatStepCount(leader.step_count)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "600"
              }}
            >
              Visits
            </Text>
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: 16,
                gap: 16
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 16
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 32,
                      fontWeight: "700"
                    }}
                  >
                    {currentMonthVisits}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 14 }}>
                    visits this month
                  </Text>
                </View>
                <View
                  style={{
                    alignItems: "flex-end",
                    gap: 4
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Check-in streak
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 20,
                      fontWeight: "700"
                    }}
                  >
                    {stats.streak} day{stats.streak === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  height: 150,
                  gap: 10
                }}
              >
                {visitTrend.map((period) => {
                  const height = Math.max(
                    (period.count / visitGraphPeak) * 104,
                    period.count > 0 ? 16 : 8
                  );

                  return (
                    <View
                      key={period.key}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 8
                      }}
                    >
                      <Text
                        style={{
                          color: period.isCurrent ? colors.text : colors.muted,
                          fontSize: 12,
                          fontWeight: period.isCurrent ? "700" : "500"
                        }}
                      >
                        {period.count}
                      </Text>
                      <View
                        style={{
                          width: "100%",
                          maxWidth: 28,
                          height,
                          minHeight: 8,
                          borderRadius: 999,
                          backgroundColor: period.count > 0
                            ? period.isCurrent
                              ? colors.text
                              : colors.accent
                            : colors.border
                        }}
                      />
                      <Text
                        style={{
                          color: period.isCurrent ? colors.text : colors.muted,
                          fontSize: 12,
                          fontWeight: period.isCurrent ? "700" : "500"
                        }}
                      >
                        {period.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel,
                  paddingHorizontal: 14,
                  paddingVertical: 12
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    All-time check-ins
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 18,
                      fontWeight: "700"
                    }}
                  >
                    {stats.totalVisits}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Last check-in
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "600"
                    }}
                  >
                    {stats.lastCheckInAt
                      ? formatMonthDay(stats.lastCheckInAt)
                      : "None yet"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "600"
              }}
            >
              PRs
            </Text>
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                padding: 16,
                gap: 12
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
                Add the lifts you care about most and keep this section personal to you.
              </Text>
              <View style={{ gap: 12 }}>
                {personalRecords.map((record, index) => (
                  <View
                    key={record.id}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.panel,
                      padding: 12,
                      gap: 10
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: "700"
                        }}
                      >
                        PR slot {index + 1}
                      </Text>
                      {personalRecords.length > 1 ? (
                        <Text
                          onPress={() => {
                            const nextRecords = personalRecords.filter(
                              (entry) => entry.id !== record.id
                            );
                            setPersonalRecords(nextRecords);
                            void savePersonalRecords(nextRecords);
                          }}
                          style={{ color: colors.muted, fontSize: 12 }}
                        >
                          Remove
                        </Text>
                      ) : null}
                    </View>
                    <TextField
                      autoCapitalize="words"
                      label="Exercise"
                      onChangeText={(value) => {
                        const nextRecords = personalRecords.map((entry) =>
                          entry.id === record.id
                            ? {
                                ...entry,
                                exercise: value
                              }
                            : entry
                        );
                        setPersonalRecords(nextRecords);
                      }}
                      placeholder="Bench press"
                      value={record.exercise}
                    />
                    <TextField
                      autoCapitalize="none"
                      label="PR"
                      onChangeText={(value) => {
                        const nextRecords = personalRecords.map((entry) =>
                          entry.id === record.id
                            ? {
                                ...entry,
                                value
                              }
                            : entry
                        );
                        setPersonalRecords(nextRecords);
                      }}
                      placeholder="225 x 3"
                      value={record.value}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label="Add PR"
                    onPress={() =>
                      setPersonalRecords((current) => [
                        ...current,
                        createEmptyPersonalRecord(current.length + 1)
                      ])
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Save PRs"
                    onPress={() => {
                      const nextRecords = personalRecords.filter(
                        (record) => record.exercise.trim() || record.value.trim()
                      );
                      const normalizedRecords =
                        nextRecords.length > 0
                          ? nextRecords
                          : [createEmptyPersonalRecord(1)];
                      setPersonalRecords(normalizedRecords);
                      void savePersonalRecords(normalizedRecords);
                    }}
                  />
                </View>
              </View>
            </View>
          </View>

        </View>
      </Card>

      <Modal
        animationType="fade"
        transparent
        visible={isQrOpen}
        onRequestClose={() => setIsQrOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(6, 8, 11, 0.84)",
            justifyContent: "center",
            padding: 20
          }}
        >
          <View
            style={{
              borderRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel,
              padding: 24,
              gap: 18
            }}
          >
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
              Member QR
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
              Show this at the front desk so staff can scan you in.
            </Text>
            <View style={{ alignItems: "center", gap: 18 }}>
              <View
                style={{
                  borderRadius: 28,
                  backgroundColor: "#ffffff",
                  padding: 20
                }}
              >
                <QRCode size={220} value={memberQrValue} />
              </View>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text
                  style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}
                >
                  {context.member.first_name} {context.member.last_name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  {context.gym?.name ?? "The Compound"}
                </Text>
              </View>
            </View>
            <SecondaryButton label="Close" onPress={() => setIsQrOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScreenScroll>
  );
}

function formatStatus(status: MemberAppContext["member"]["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildStepTrend(
  checkIns: CheckInRecord[],
  workouts: WorkoutRecord[],
  stepRange: StepRange
) {
  const dailySteps = buildDailyStepMap(checkIns, workouts);

  if (stepRange === "month") {
    return buildMonthlyStepTrend(dailySteps);
  }

  if (stepRange === "year") {
    return buildYearlyStepTrend(dailySteps);
  }

  return buildWeeklyStepTrend(dailySteps);
}

function formatStepCount(steps: number) {
  return formatCount(steps);
}

function formatCompactSteps(steps: number) {
  if (steps >= 1000) {
    const rounded = steps / 1000;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }

  return String(steps);
}

function buildDailyStepMap(
  checkIns: CheckInRecord[],
  workouts: WorkoutRecord[]
) {
  const dailySteps = new Map<string, number>();

  for (const checkIn of checkIns) {
    const key = toDateKey(checkIn.created_at);
    dailySteps.set(key, (dailySteps.get(key) ?? 2800) + 1700);
  }

  for (const workout of workouts) {
    const key = toDateKey(workout.performed_at);
    dailySteps.set(key, (dailySteps.get(key) ?? 2800) + 2600);
  }

  return dailySteps;
}

function buildWeeklyStepTrend(dailySteps: Map<string, number>) {
  const today = startOfDay(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = toDateKey(date);

    return {
      key,
      steps: dailySteps.get(key) ?? 2800,
      label: formatWeekdayNarrow(date),
      isCurrent: key === toDateKey(today)
    };
  });
}

function buildMonthlyStepTrend(dailySteps: Map<string, number>) {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth);
    date.setMonth(currentMonth.getMonth() - (5 - index));
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const steps = sumStepMapWithinRange(dailySteps, monthStart, monthEnd);

    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      steps,
      label: formatShortMonth(date),
      isCurrent:
        date.getFullYear() === currentMonth.getFullYear() &&
        date.getMonth() === currentMonth.getMonth()
    };
  });
}

function buildYearlyStepTrend(dailySteps: Map<string, number>) {
  const currentYear = new Date().getFullYear();

  return Array.from({ length: 4 }, (_, index) => {
    const year = currentYear - (3 - index);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const steps = sumStepMapWithinRange(dailySteps, yearStart, yearEnd);

    return {
      key: String(year),
      steps,
      label: String(year).slice(-2),
      isCurrent: year === currentYear
    };
  });
}

function buildMonthlyVisitTrend(checkIns: CheckInRecord[]) {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth);
    date.setMonth(currentMonth.getMonth() - (5 - index));
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const count = checkIns.filter((checkIn) => {
      const checkInDate = new Date(checkIn.created_at);
      return checkInDate >= monthStart && checkInDate <= monthEnd;
    }).length;

    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      count,
      label: formatShortMonth(date),
      isCurrent:
        date.getFullYear() === currentMonth.getFullYear() &&
        date.getMonth() === currentMonth.getMonth()
    };
  });
}

function sumStepMapWithinRange(
  dailySteps: Map<string, number>,
  rangeStart: Date,
  rangeEnd: Date
) {
  const startKey = toDateKey(rangeStart);
  const endKey = toDateKey(rangeEnd);
  let total = 0;

  for (const [key, steps] of dailySteps.entries()) {
    if (key >= startKey && key <= endKey) {
      total += steps;
    }
  }

  return total;
}

function calculateGoalStepStreak(
  checkIns: CheckInRecord[],
  workouts: WorkoutRecord[],
  dailyStepGoal: number
) {
  const dailySteps = buildDailyStepMap(checkIns, workouts);
  const today = startOfDay(new Date());
  let streak = 0;

  for (let index = 0; index < 365; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = toDateKey(date);
    const steps = dailySteps.get(key) ?? 2800;

    if (steps < dailyStepGoal) {
      if (index === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if ((dailySteps.get(toDateKey(yesterday)) ?? 2800) < dailyStepGoal) {
          return 0;
        }

        continue;
      }

      break;
    }

    streak += 1;
  }

  return streak;
}

function getRangeSummaryLabel(stepRange: StepRange) {
  switch (stepRange) {
    case "month":
      return "steps over the last 6 months";
    case "year":
      return "steps over the last 4 years";
    default:
      return "steps over the last 7 days";
  }
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toDateKey(value: string | Date) {
  return startOfDay(new Date(value)).toISOString().slice(0, 10);
}

function getChallengeProgress(
  challenge: GymChallengeRecord,
  checkIns: CheckInRecord[],
  workouts: WorkoutRecord[],
  currentWeeklySteps: number
) {
  const rangeStart = new Date(challenge.starts_on);
  const rangeEnd = new Date(challenge.ends_on);

  if (challenge.metric_type === "steps") {
    const dailySteps = buildDailyStepMap(checkIns, workouts);
    return {
      current: challenge.period === "weekly"
        ? currentWeeklySteps
        : sumStepMapWithinRange(dailySteps, rangeStart, rangeEnd)
    };
  }

  if (challenge.metric_type === "workouts") {
    return {
      current: workouts.filter((workout) => {
        const performedAt = new Date(workout.performed_at);
        return performedAt >= rangeStart && performedAt <= rangeEnd;
      }).length
    };
  }

  return {
    current: checkIns.filter((checkIn) => {
      const createdAt = new Date(checkIn.created_at);
      return createdAt >= rangeStart && createdAt <= rangeEnd;
    }).length
  };
}

function formatChallengeValue(
  metricType: GymChallengeRecord["metric_type"],
  value: number
) {
  if (metricType === "steps") {
    return formatStepCount(value);
  }

  return String(value);
}
