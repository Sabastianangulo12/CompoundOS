import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  bookScheduleSession,
  cancelScheduleBooking,
  fetchMemberSchedule,
  type MemberScheduleSession
} from "../lib/schedule";
import { colors } from "../theme";

type PendingAction = {
  type: "book" | "cancel";
  id: string;
} | null;

export function ScheduleScreen() {
  const [sessions, setSessions] = useState<MemberScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  async function loadSchedule() {
    setErrorMessage(null);
    const result = await fetchMemberSchedule();

    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setSessions(result.data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadSchedule();
  }, []);

  async function handleBook(sessionId: string) {
    setPendingAction({
      type: "book",
      id: sessionId
    });
    setErrorMessage(null);
    const result = await bookScheduleSession(sessionId);

    if (result.error) {
      setErrorMessage(result.error.message);
    }

    await loadSchedule();
    setPendingAction(null);
  }

  async function handleCancel(bookingId: string) {
    setPendingAction({
      type: "cancel",
      id: bookingId
    });
    setErrorMessage(null);
    const result = await cancelScheduleBooking(bookingId);

    if (result.error) {
      setErrorMessage(result.error.message);
    }

    await loadSchedule();
    setPendingAction(null);
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
          gap: 12
        }}
      >
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted, fontSize: 14 }}>Loading schedule...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 120,
        gap: 14
      }}
      style={{
        flex: 1,
        backgroundColor: colors.background
      }}
    >
      <View
        style={{
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 18,
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
          Class schedule
        </Text>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
          Book your next session
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          Reserve a spot, join the waitlist, or cancel an upcoming booking from the
          member app.
        </Text>
      </View>

      {errorMessage ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.12)",
            padding: 14
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14 }}>{errorMessage}</Text>
        </View>
      ) : null}

      {sessions.length === 0 ? (
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            padding: 18
          }}
        >
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
            No upcoming sessions yet
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 }}>
            Your gym has not published bookable member sessions. Check back soon or ask
            the front desk.
          </Text>
        </View>
      ) : (
        sessions.map((session) => {
          const memberBooking = session.memberBooking;
          const isBooked =
            memberBooking?.status === "booked" || memberBooking?.status === "checked_in";
          const isWaitlisted = memberBooking?.status === "waitlisted";
          const isFull =
            typeof session.spotsRemaining === "number" && session.spotsRemaining <= 0;
          const canBook =
            session.bookingEnabled &&
            !memberBooking &&
            (!isFull || session.waitlistEnabled);
          const buttonLabel = isFull && session.waitlistEnabled ? "Join waitlist" : "Book";
          const pendingBook =
            pendingAction?.type === "book" && pendingAction.id === session.id;
          const pendingCancel =
            pendingAction?.type === "cancel" && pendingAction.id === memberBooking?.id;

          return (
            <View
              key={session.id}
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                padding: 16,
                gap: 12
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {session.program ? (
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: session.program.color,
                      paddingHorizontal: 10,
                      paddingVertical: 5
                    }}
                  >
                    <Text
                      style={{
                        color: session.program.color,
                        fontSize: 11,
                        fontWeight: "800"
                      }}
                    >
                      {session.program.name}
                    </Text>
                  </View>
                ) : null}
                {memberBooking ? (
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.accent,
                      paddingHorizontal: 10,
                      paddingVertical: 5
                    }}
                  >
                    <Text
                      style={{
                        color: colors.accent,
                        fontSize: 11,
                        fontWeight: "800"
                      }}
                    >
                      {isWaitlisted ? "Waitlisted" : "Booked"}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
                  {session.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 14, marginTop: 5 }}>
                  {session.dateLabel} - {session.timeLabel}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, marginTop: 5 }}>
                  {[session.instructorName, session.location]
                    .filter(Boolean)
                    .join(" - ") || "Details coming soon"}
                </Text>
              </View>

              {session.description ? (
                <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                  {session.description}
                </Text>
              ) : null}

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panelElevated,
                  padding: 12,
                  gap: 4
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                  {session.capacityLabel}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {session.counts.waitlisted} waitlisted - {session.counts.checkedIn} checked in
                </Text>
              </View>

              {memberBooking ? (
                <Pressable
                  disabled={pendingCancel || isBooked && memberBooking.status === "checked_in"}
                  onPress={() => handleCancel(memberBooking.id)}
                  style={{
                    minHeight: 48,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity:
                      pendingCancel || (isBooked && memberBooking.status === "checked_in")
                        ? 0.55
                        : 1
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                    {pendingCancel
                      ? "Canceling..."
                      : memberBooking.status === "checked_in"
                        ? "Already checked in"
                        : "Cancel booking"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  disabled={!canBook || pendingBook}
                  onPress={() => handleBook(session.id)}
                  style={{
                    minHeight: 48,
                    borderRadius: 16,
                    backgroundColor: canBook ? colors.accent : colors.panelElevated,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pendingBook ? 0.65 : 1
                  }}
                >
                  <Text
                    style={{
                      color: canBook ? colors.background : colors.muted,
                      fontSize: 14,
                      fontWeight: "800"
                    }}
                  >
                    {pendingBook
                      ? "Saving..."
                      : canBook
                        ? buttonLabel
                        : session.bookingEnabled
                          ? "Class full"
                          : "Booking closed"}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
