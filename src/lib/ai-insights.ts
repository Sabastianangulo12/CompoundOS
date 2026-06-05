import { runAutomationsForInsights } from "@/lib/automation-runner";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database, Member } from "@/types/database";
import { formatCurrencyFromCents } from "@/lib/revenue";

type MemberRow = Database["public"]["Tables"]["members"]["Row"];
type CheckInRow = Database["public"]["Tables"]["check_ins"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type InsightType = Database["public"]["Tables"]["ai_insights"]["Row"]["type"];
type InsightPriority = Database["public"]["Tables"]["ai_insights"]["Row"]["priority"];

export type InsightWithMember = Database["public"]["Tables"]["ai_insights"]["Row"] & {
  members: Pick<Member, "id" | "first_name" | "last_name" | "email"> | null;
};

type CalculatedMemberInsight = {
  gym_id: string;
  member_id: string | null;
  type: InsightType;
  title: string;
  description: string;
  priority: InsightPriority;
  status: "open";
};

type RecalculateGymInsightsOptions = {
  inlineAutomationLimit?: number;
  maxOpenInsights?: number;
};

const DEFAULT_INLINE_AUTOMATION_LIMIT = 0;
const DEFAULT_MAX_OPEN_INSIGHTS = 80;
const insightPriorityRank: Record<InsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

type MemberSignalRow = Pick<
  MemberRow,
  | "id"
  | "gym_id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "status"
  | "created_at"
  | "updated_at"
>;
type CheckInSignalRow = Pick<CheckInRow, "member_id" | "created_at">;
type SubscriptionSignalRow = Pick<SubscriptionRow, "member_id" | "status">;
type FailedPaymentSignalRow = Pick<
  PaymentRow,
  "member_id" | "status" | "amount_cents" | "created_at"
>;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysSince(dateIso: string | null | undefined) {
  if (!dateIso) {
    return Number.POSITIVE_INFINITY;
  }

  const now = Date.now();
  const then = new Date(dateIso).getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function countCheckInsWithinDays(checkIns: CheckInRow[], dayWindow: number) {
  const threshold = Date.now() - dayWindow * 24 * 60 * 60 * 1000;
  return checkIns.filter((checkIn) => new Date(checkIn.created_at).getTime() >= threshold)
    .length;
}

function countRecentCheckIns(checkIns: CheckInSignalRow[], dayWindow: number) {
  const threshold = Date.now() - dayWindow * 24 * 60 * 60 * 1000;
  return checkIns.filter((checkIn) => new Date(checkIn.created_at).getTime() >= threshold)
    .length;
}

function buildScoresForMember(member: MemberSignalRow, checkIns: CheckInSignalRow[]) {
  const sorted = [...checkIns].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );

  const lastCheckInAt = sorted[0]?.created_at ?? null;
  const days = daysSince(lastCheckInAt);
  const recent7 = countRecentCheckIns(sorted, 7);
  const previous7 = sorted.filter((checkIn) => {
    const ageInDays = daysSince(checkIn.created_at);
    return ageInDays > 7 && ageInDays <= 14;
  }).length;

  let engagement = 55;
  let retentionRisk = 18;

  if (!Number.isFinite(days)) {
    engagement -= 30;
    retentionRisk += 52;
  } else if (days <= 1) {
    engagement += 24;
    retentionRisk -= 10;
  } else if (days <= 2) {
    engagement += 10;
  } else if (days <= 4) {
    engagement -= 12;
    retentionRisk += 15;
  } else if (days <= 6) {
    engagement -= 24;
    retentionRisk += 36;
  } else {
    engagement -= 34;
    retentionRisk += 55;
  }

  if (recent7 >= 4) {
    engagement += 18;
    retentionRisk -= 10;
  } else if (recent7 >= 2) {
    engagement += 10;
    retentionRisk -= 6;
  } else if (recent7 === 0) {
    engagement -= 10;
  }

  if (previous7 >= 3 && recent7 === 0) {
    engagement -= 8;
    retentionRisk += 14;
  }

  if (member.status === "lead") {
    retentionRisk += 8;
  }

  if (member.status === "frozen") {
    engagement -= 10;
    retentionRisk += 10;
  }

  return {
    engagementScore: clampScore(engagement),
    retentionRiskScore: clampScore(retentionRisk),
    daysSinceLastCheckIn: days,
    recent7,
    previous7
  };
}

function buildInsightsForMember(
  member: MemberSignalRow,
  scores: ReturnType<typeof buildScoresForMember>,
  subscriptions: SubscriptionSignalRow[],
  payments: FailedPaymentSignalRow[]
) {
  const fullName = `${member.first_name} ${member.last_name}`.trim();
  const insights: CalculatedMemberInsight[] = [];
  const activeRevenueSubscription =
    subscriptions.find((subscription) =>
      ["active", "trialing"].includes(subscription.status)
    ) ?? null;
  const pastDueSubscription =
    subscriptions.find((subscription) => subscription.status === "past_due") ?? null;
  const latestFailedPayment =
    payments
      .filter((payment) => payment.status === "failed")
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      )[0] ?? null;

  if (scores.retentionRiskScore >= 70) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "retention_risk",
      title: `${fullName} is at high retention risk`,
      description:
        scores.daysSinceLastCheckIn === Number.POSITIVE_INFINITY
          ? "No check-in history has been recorded for this member yet."
          : `Last check-in was ${scores.daysSinceLastCheckIn} days ago and engagement has softened.`,
      priority: "high",
      status: "open"
    });
  }

  if (member.status === "active" && !activeRevenueSubscription && !pastDueSubscription) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "missing_subscription",
      title: `${fullName} is active without a subscription`,
      description:
        "This member is marked active but does not have a live subscription attached, which can leave revenue untracked.",
      priority: "high",
      status: "open"
    });
  }

  if (
    Number.isFinite(scores.daysSinceLastCheckIn) &&
    scores.daysSinceLastCheckIn >= 5 &&
    scores.daysSinceLastCheckIn <= 7
  ) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "inactivity",
      title: `${fullName} has gone quiet`,
      description: `No check-in has been recorded in ${scores.daysSinceLastCheckIn} days. A recovery touchpoint may help.`,
      priority: scores.daysSinceLastCheckIn >= 7 ? "high" : "medium",
      status: "open"
    });
  }

  if (pastDueSubscription) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "revenue_leak",
      title: `${fullName} has a past-due subscription`,
      description:
        "Billing is stalled on an assigned subscription. A recovery follow-up could protect recurring revenue.",
      priority: "high",
      status: "open"
    });
  }

  if (latestFailedPayment) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "failed_payment",
      title: `${fullName} has a failed payment`,
      description: `A payment attempt for ${formatCurrencyFromCents(
        latestFailedPayment.amount_cents
      )} failed and needs attention.`,
      priority: pastDueSubscription ? "high" : "medium",
      status: "open"
    });
  }

  if (scores.previous7 >= 3 && scores.recent7 === 0) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "attendance_drop",
      title: `${fullName} shows an attendance drop`,
      description:
        "Attendance was steady last week but has dropped off across the last 7 days.",
      priority: "medium",
      status: "open"
    });
  }

  if (
    activeRevenueSubscription &&
    scores.engagementScore >= 78 &&
    scores.recent7 >= 4
  ) {
    insights.push({
      gym_id: member.gym_id,
      member_id: member.id,
      type: "upsell_opportunity",
      title: `${fullName} looks ready for an upsell`,
      description:
        "Attendance is strong and engagement is high. This member may be a good fit for premium coaching, specialty access, or a higher-value plan.",
      priority: "medium",
      status: "open"
    });
  }

  return insights;
}

export async function recalculateGymInsights(
  supabase: AppSupabaseClient,
  gymId: string,
  options: RecalculateGymInsightsOptions = {}
) {
  const [membersResult, checkInsResult, subscriptionsResult, paymentsResult] =
    await Promise.all([
      supabase
        .from("members")
        .select("id,gym_id,first_name,last_name,email,phone,status,created_at,updated_at")
        .eq("gym_id", gymId)
        .neq("status", "canceled"),
      supabase
        .from("check_ins")
        .select("member_id,created_at")
        .eq("gym_id", gymId)
        .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", {
          ascending: false
        }),
      supabase
        .from("subscriptions")
        .select("member_id,status")
        .eq("gym_id", gymId)
        .in("status", ["active", "trialing", "past_due"]),
      supabase
        .from("payments")
        .select("member_id,status,amount_cents,created_at")
        .eq("gym_id", gymId)
        .eq("status", "failed")
    ]);

  if (membersResult.error) {
    return {
      error: membersResult.error
    };
  }

  if (checkInsResult.error) {
    return {
      error: checkInsResult.error
    };
  }

  if (subscriptionsResult.error) {
    return {
      error: subscriptionsResult.error
    };
  }

  if (paymentsResult.error) {
    return {
      error: paymentsResult.error
    };
  }

  const members = membersResult.data ?? [];
  const checkIns = (checkInsResult.data ?? []) as CheckInSignalRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionSignalRow[];
  const payments = (paymentsResult.data ?? []) as FailedPaymentSignalRow[];
  const checkInsByMember = new Map<string, CheckInSignalRow[]>();
  const subscriptionsByMember = new Map<string, SubscriptionSignalRow[]>();
  const paymentsByMember = new Map<string, FailedPaymentSignalRow[]>();

  checkIns.forEach((checkIn) => {
    const collection = checkInsByMember.get(checkIn.member_id) ?? [];
    collection.push(checkIn);
    checkInsByMember.set(checkIn.member_id, collection);
  });

  subscriptions.forEach((subscription) => {
    const collection = subscriptionsByMember.get(subscription.member_id) ?? [];
    collection.push(subscription);
    subscriptionsByMember.set(subscription.member_id, collection);
  });

  payments.forEach((payment) => {
    if (!payment.member_id) {
      return;
    }

    const collection = paymentsByMember.get(payment.member_id) ?? [];
    collection.push(payment);
    paymentsByMember.set(payment.member_id, collection);
  });

  const calculatedAt = new Date().toISOString();
  const scoreCalculations = members.map((member) => {
    const scores = buildScoresForMember(member, checkInsByMember.get(member.id) ?? []);

    return {
      member,
      scores
    };
  });

  const scoreRows = scoreCalculations.map(({ member, scores }) => ({
    gym_id: gymId,
    member_id: member.id,
    engagement_score: scores.engagementScore,
    retention_risk_score: scores.retentionRiskScore,
    last_calculated_at: calculatedAt
  }));

  const insights = scoreCalculations.flatMap(({ member, scores }) =>
    buildInsightsForMember(
      member,
      scores,
      subscriptionsByMember.get(member.id) ?? [],
      paymentsByMember.get(member.id) ?? []
    )
  );
  const maxOpenInsights =
    typeof options.maxOpenInsights === "number" && options.maxOpenInsights > 0
      ? Math.floor(options.maxOpenInsights)
      : DEFAULT_MAX_OPEN_INSIGHTS;
  const cappedInsights = [...insights]
    .sort((left, right) => {
      const priorityDelta =
        insightPriorityRank[left.priority] - insightPriorityRank[right.priority];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, maxOpenInsights);
  let automationExecuted = 0;
  let automationSkippedByLimit = 0;

  const { error: deleteError } = await supabase
    .from("ai_insights")
    .delete()
    .eq("gym_id", gymId)
    .eq("status", "open");

  if (deleteError) {
    return {
      error: deleteError
    };
  }

  if (scoreRows.length > 0) {
    const { error: scoreError } = await supabase.from("member_scores").upsert(
      scoreRows,
      {
        onConflict: "gym_id,member_id"
      }
    );

    if (scoreError) {
      return {
        error: scoreError
      };
    }
  }

  if (cappedInsights.length > 0) {
    const { data: insertedInsights, error: insightError } = await supabase
      .from("ai_insights")
      .insert(cappedInsights)
      .select("*");

    if (insightError) {
      return {
        error: insightError
      };
    }

    const automationResult = await runAutomationsForInsights(
      supabase,
      gymId,
      insertedInsights ?? [],
      {
        maxInsights:
          options.inlineAutomationLimit ?? DEFAULT_INLINE_AUTOMATION_LIMIT
      }
    );

    if (automationResult.error) {
      return {
        error: automationResult.error
      };
    }

    automationExecuted = automationResult.executed;
    automationSkippedByLimit = automationResult.skippedByLimit;
  }

  return {
    error: null,
    processedMembers: members.length,
    createdInsights: cappedInsights.length,
    generatedInsights: insights.length,
    automationExecuted,
    automationSkippedByLimit
  };
}

export function formatInsightRunMessage(result: {
  automationExecuted?: number;
  automationSkippedByLimit?: number;
  createdInsights: number;
  generatedInsights?: number;
  processedMembers: number;
}) {
  const insightPlural = result.createdInsights === 1 ? "" : "s";
  const generatedNote =
    result.generatedInsights && result.generatedInsights > result.createdInsights
      ? ` Top ${result.createdInsights} of ${result.generatedInsights} generated signal${
          result.generatedInsights === 1 ? "" : "s"
        } are open for operators.`
      : "";
  const automationNote =
    typeof result.automationExecuted === "number"
      ? ` Inline automations ran for ${result.automationExecuted} insight${
          result.automationExecuted === 1 ? "" : "s"
        }${
          result.automationSkippedByLimit
            ? `; ${result.automationSkippedByLimit} heavier follow-up${
                result.automationSkippedByLimit === 1 ? "" : "s"
              } deferred.`
            : "."
        }`
      : "";

  return `Analysis complete. Processed ${result.processedMembers} members and opened ${result.createdInsights} insight${insightPlural}.${generatedNote}${automationNote}`;
}

export function groupInsightsByPriority(insights: InsightWithMember[]) {
  return {
    high: insights.filter((insight) => insight.priority === "high"),
    medium: insights.filter((insight) => insight.priority === "medium"),
    low: insights.filter((insight) => insight.priority === "low")
  };
}

export const insightTypeMeta: Record<
  InsightType,
  {
    label: string;
    icon: string;
  }
> = {
  retention_risk: {
    label: "Retention risk",
    icon: "Risk"
  },
  inactivity: {
    label: "Inactivity",
    icon: "Idle"
  },
  attendance_drop: {
    label: "Attendance drop",
    icon: "Drop"
  },
  failed_payment: {
    label: "Failed payment",
    icon: "Pay"
  },
  missing_subscription: {
    label: "Missing subscription",
    icon: "Sub"
  },
  revenue_leak: {
    label: "Revenue leak",
    icon: "Leak"
  },
  upsell_opportunity: {
    label: "Upsell opportunity",
    icon: "Grow"
  }
};
