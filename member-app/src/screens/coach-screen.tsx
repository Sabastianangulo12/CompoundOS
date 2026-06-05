import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Card,
  PrimaryButton,
  ScreenScroll,
  SectionTitle,
  SecondaryButton,
  TextField
} from "../components/ui";
import {
  askAICoach,
  getLastCoachRecommendation,
  type CoachMessage
} from "../lib/ai-coach";
import type {
  CheckInRecord,
  MemberAppContext,
  MemberStats
} from "../lib/member";
import type { WorkoutRecord } from "../lib/workouts";
import { colors } from "../theme";

const starterQuestions = [
  "What should I train today?",
  "Why am I not progressing?",
  "Adjust my workout"
];

export function CoachScreen({
  memberContext,
  memberStats,
  recentWorkouts,
  recentCheckIns,
  onStartWorkout
}: {
  memberContext: MemberAppContext;
  memberStats: MemberStats;
  recentWorkouts: WorkoutRecord[];
  recentCheckIns: CheckInRecord[];
  onStartWorkout: (message: CoachMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialMessages() {
      const lastRecommendation = await getLastCoachRecommendation();

      if (!isMounted) {
        return;
      }

      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content:
            "Ask about today's training, progress stalls, or simple workout adjustments. I'll keep it short and practical."
        },
        ...(lastRecommendation
          ? [
              {
                id: "last-recommendation",
                role: "assistant" as const,
                content: lastRecommendation.message,
                recommendation: lastRecommendation
              }
            ]
          : [])
      ]);
    }

    void loadInitialMessages();

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitQuestion(question: string) {
    const normalized = question.trim();

    if (!normalized || pending) {
      return;
    }

    const userMessage: CoachMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalized
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setPending(true);

    const result = await askAICoach({
      memberContext,
      memberStats,
      recentWorkouts,
      recentCheckIns,
      question: normalized
    });

    setPending(false);

    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content:
          result.recommendation?.message ??
          result.error?.message ??
          "Keep today's session simple and intentional.",
        recommendation: result.recommendation ?? null
      }
    ]);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({
        animated: true
      });
    });
  }

  return (
    <ScreenScroll>
      <SectionTitle
        title="AI Coach"
        subtitle="Short, practical strength coaching based on your recent gym activity."
      />

      <Card>
        <Text style={{ color: colors.muted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1.4 }}>
          Quick asks
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {starterQuestions.map((question) => (
            <Text
              key={question}
              onPress={() => {
                void submitQuestion(question);
              }}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panelElevated,
                color: colors.text,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 13
              }}
            >
              {question}
            </Text>
          ))}
        </View>
      </Card>

      <Card>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ gap: 12 }}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "86%",
                borderRadius: 22,
                backgroundColor:
                  message.role === "user" ? colors.accent : colors.panelElevated,
                paddingHorizontal: 14,
                paddingVertical: 12
              }}
            >
              <Text
                style={{
                  color: message.role === "user" ? "#151515" : colors.text,
                  fontSize: 14,
                  lineHeight: 20
                }}
              >
                {message.content}
              </Text>
              {message.role === "assistant" && message.recommendation ? (
                <View
                  style={{
                    marginTop: 12,
                    gap: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 12
                  }}
                >
                  <View
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      backgroundColor: colors.background,
                      paddingHorizontal: 10,
                      paddingVertical: 6
                    }}
                  >
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                      {message.recommendation.focus} | {message.recommendation.intensity}
                    </Text>
                  </View>
                  {message.recommendation.suggested_workout.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {message.recommendation.suggested_workout.map((item, index) => (
                        <View
                          key={`${message.id}-${item.exercise}-${index}`}
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                            padding: 10,
                            gap: 4
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                            {item.exercise}
                          </Text>
                          <Text style={{ color: colors.muted, fontSize: 13 }}>
                            {item.sets} sets | {item.reps} reps | {item.weight}
                          </Text>
                        </View>
                      ))}
                      <SecondaryButton
                        label="Start Workout"
                        onPress={() => {
                          onStartWorkout(message);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
          {pending ? (
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 22,
                backgroundColor: colors.panelElevated,
                paddingHorizontal: 14,
                paddingVertical: 12
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                Coach is thinking...
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </Card>

      <Card>
        <TextField
          autoCapitalize="sentences"
          label="Ask your coach"
          multiline
          onChangeText={setDraft}
          placeholder="What should I train today?"
          value={draft}
        />
        <PrimaryButton
          disabled={pending || !draft.trim()}
          label={pending ? "Sending..." : "Send"}
          onPress={() => {
            void submitQuestion(draft);
          }}
        />
      </Card>
    </ScreenScroll>
  );
}
