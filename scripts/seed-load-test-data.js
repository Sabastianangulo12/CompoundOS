const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_LOADTEST_MEMBER_COUNT = 150;
const LOADTEST_EMAIL_PREFIX = "loadtest+";
const LOADTEST_EMAIL_DOMAIN = "compoundos.local";
const LOADTEST_TAG = "[Loadtest]";

const FIRST_NAMES = [
  "Aiden",
  "Ava",
  "Blake",
  "Brooke",
  "Cameron",
  "Chloe",
  "Cole",
  "Daisy",
  "Derek",
  "Ella",
  "Ethan",
  "Grace",
  "Hudson",
  "Ivy",
  "Jace",
  "Jade",
  "Kai",
  "Layla",
  "Levi",
  "Lila",
  "Luca",
  "Maya",
  "Milo",
  "Naomi",
  "Nora",
  "Owen",
  "Parker",
  "Riley",
  "Rowan",
  "Sadie",
  "Theo",
  "Violet",
  "Wyatt",
  "Zoe"
];

const LAST_NAMES = [
  "Anderson",
  "Baker",
  "Brooks",
  "Carter",
  "Diaz",
  "Ellis",
  "Foster",
  "Garcia",
  "Hughes",
  "Jackson",
  "Kim",
  "Lopez",
  "Martin",
  "Nguyen",
  "Ortiz",
  "Patel",
  "Quinn",
  "Reed",
  "Sanchez",
  "Taylor",
  "Usman",
  "Valdez",
  "Walker",
  "Young"
];

const EXERCISES = [
  "Back Squat",
  "Bench Press",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Romanian Deadlift",
  "Incline Dumbbell Press",
  "Lat Pulldown",
  "Walking Lunge",
  "Hip Thrust"
];

const CHALLENGE_DEFS = [
  {
    title: `${LOADTEST_TAG} 12k Step Sprint`,
    description: "Keep the floor buzzing with a weekly step race.",
    metric_type: "steps",
    goal_value: 12000,
    period: "weekly"
  },
  {
    title: `${LOADTEST_TAG} 16 Visit Push`,
    description: "Monthly attendance challenge for consistency.",
    metric_type: "visits",
    goal_value: 16,
    period: "monthly"
  },
  {
    title: `${LOADTEST_TAG} 20 Workout Builder`,
    description: "Reward members who log their sessions consistently.",
    metric_type: "workouts",
    goal_value: 20,
    period: "monthly"
  }
];

const PRODUCT_DEFS = [
  ["drinks_fridge", "Cold Brew", 550],
  ["drinks_fridge", "Electrolyte Water", 450],
  ["meal_prep_fridge", "Chicken Rice Bowl", 1299],
  ["meal_prep_fridge", "Steak Burrito Bowl", 1499],
  ["protein_candy", "Protein Bar", 399],
  ["protein_candy", "Sour Candy", 275],
  ["tclc_merch", "Club Tee", 3200],
  ["tclc_merch", "Lifting Straps", 1800]
];

function readEnvFile(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const separator = line.indexOf("=");
      if (separator > 0) {
        acc[line.slice(0, separator)] = line.slice(separator + 1);
      }
      return acc;
    }, {});
}

function makeSupabaseClient() {
  const env = readEnvFile(path.join(process.cwd(), ".env.local"));
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function getRequestedMemberCount() {
  const rawValue = process.argv[2] ?? process.env.LOADTEST_MEMBER_COUNT;
  const parsed = Number(rawValue ?? DEFAULT_LOADTEST_MEMBER_COUNT);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LOADTEST_MEMBER_COUNT;
  }

  return Math.floor(parsed);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function randomItem(items, seed) {
  return items[seed % items.length];
}

function dateDaysAgo(daysAgo, hour = 9) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, (daysAgo * 7) % 60, 0, 0);
  return date.toISOString();
}

function dateDaysAhead(daysAhead, hour = 9) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hour, (daysAhead * 11) % 60, 0, 0);
  return date.toISOString();
}

function dateOnlyDaysAgo(daysAgo) {
  return dateDaysAgo(daysAgo).slice(0, 10);
}

function dateOnlyDaysAhead(daysAhead) {
  return dateDaysAhead(daysAhead).slice(0, 10);
}

function currencyAmountForPlan(plan) {
  return plan.price_cents;
}

function makeEmail(index) {
  return `${LOADTEST_EMAIL_PREFIX}${String(index).padStart(3, "0")}@${LOADTEST_EMAIL_DOMAIN}`;
}

function makePhone(index) {
  return `555-01${String(index).padStart(3, "0")}`;
}

function createMemberSpec(index, planPool) {
  const firstName = randomItem(FIRST_NAMES, index);
  const lastName = randomItem(LAST_NAMES, index * 3);
  const joinedDaysAgo = 30 + (index % 320);
  const plan = planPool[index % planPool.length];
  let status = "active";
  let subscriptionStatus = "active";
  let hasCardOnFile = true;
  let engagement = "steady";

  if (index < 15) {
    status = "lead";
    subscriptionStatus = "none";
    hasCardOnFile = false;
    engagement = "none";
  } else if (index < 30) {
    status = "frozen";
    subscriptionStatus = "active";
    hasCardOnFile = true;
    engagement = "low";
  } else if (index < 40) {
    status = "canceled";
    subscriptionStatus = "canceled";
    hasCardOnFile = index % 2 === 0;
    engagement = "none";
  } else if (index < 60) {
    status = "active";
    subscriptionStatus = "past_due";
    hasCardOnFile = index % 3 !== 0;
    engagement = "dropping";
  } else if (index < 72) {
    status = "active";
    subscriptionStatus = "trialing";
    hasCardOnFile = index % 2 === 0;
    engagement = "ramping";
  } else if (index < 110) {
    status = "active";
    subscriptionStatus = "active";
    hasCardOnFile = true;
    engagement = "high";
  } else {
    status = "active";
    subscriptionStatus = "active";
    hasCardOnFile = index % 5 !== 0;
    engagement = "steady";
  }

  return {
    index,
    firstName,
    lastName,
    email: makeEmail(index + 1),
    phone: makePhone(index + 1),
    joinedAt: dateDaysAgo(joinedDaysAgo, 8 + (index % 8)),
    status,
    frozenUntil:
      status === "frozen"
        ? dateOnlyDaysAhead(7 + (index % 20))
        : null,
    canceledAt:
      status === "canceled" ? dateDaysAgo(3 + (index % 40), 12) : null,
    stripeCustomerId: hasCardOnFile ? `cus_loadtest_${String(index + 1).padStart(3, "0")}` : null,
    stripePaymentMethodId: hasCardOnFile
      ? `pm_loadtest_${String(index + 1).padStart(3, "0")}`
      : null,
    plan,
    subscriptionStatus,
    engagement
  };
}

async function deleteInBatches(queryFactory, ids, batchSize = 100) {
  for (const batch of chunk(ids, batchSize)) {
    if (batch.length === 0) continue;
    const { error } = await queryFactory(batch);
    if (error) {
      throw error;
    }
  }
}

async function cleanupExistingLoadtestData(supabase, gymId) {
  const membersResult = await supabase
    .from("members")
    .select("id")
    .eq("gym_id", gymId)
    .ilike("email", `${LOADTEST_EMAIL_PREFIX}%@${LOADTEST_EMAIL_DOMAIN}`);

  if (membersResult.error) {
    throw membersResult.error;
  }

  const memberIds = (membersResult.data ?? []).map((member) => member.id);
  if (memberIds.length > 0) {
    const workoutsResult = await supabase
      .from("workouts")
      .select("id")
      .in("member_id", memberIds);
    if (workoutsResult.error) {
      throw workoutsResult.error;
    }
    const workoutIds = (workoutsResult.data ?? []).map((workout) => workout.id);

    const postsResult = await supabase
      .from("community_posts")
      .select("id")
      .in("member_id", memberIds);
    if (postsResult.error) {
      throw postsResult.error;
    }
    const postIds = (postsResult.data ?? []).map((post) => post.id);

    if (workoutIds.length > 0) {
      await deleteInBatches(
        (batch) => supabase.from("workout_sets").delete().in("workout_id", batch),
        workoutIds
      );
    }

    if (postIds.length > 0) {
      await deleteInBatches(
        (batch) => supabase.from("post_comments").delete().in("post_id", batch),
        postIds
      );
      await deleteInBatches(
        (batch) => supabase.from("post_likes").delete().in("post_id", batch),
        postIds
      );
    }

    const tablesByMemberId = [
      "member_scores",
      "ai_insights",
      "check_ins",
      "notifications",
      "member_notes",
      "member_follow_up_tasks",
      "payments",
      "subscriptions",
      "member_membership_events",
      "member_freeze_reminders",
      "workouts",
      "community_posts"
    ];

    for (const tableName of tablesByMemberId) {
      await deleteInBatches(
        (batch) => supabase.from(tableName).delete().in("member_id", batch),
        memberIds
      );
    }

    await deleteInBatches(
      (batch) =>
        supabase
          .from("friend_requests")
          .delete()
          .in("sender_member_id", batch),
      memberIds
    );
    await deleteInBatches(
      (batch) =>
        supabase
          .from("friend_requests")
          .delete()
          .in("receiver_member_id", batch),
      memberIds
    );

    await deleteInBatches(
      (batch) => supabase.from("members").delete().in("id", batch),
      memberIds
    );
  }

  const cleanupLikeColumns = [
    ["membership_plans", "name"],
    ["gym_announcements", "title"],
    ["gym_challenges", "title"],
    ["gym_shoutouts", "title"],
    ["gym_member_spotlights", "title"],
    ["fridge_products", "name"]
  ];

  for (const [tableName, columnName] of cleanupLikeColumns) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("gym_id", gymId)
      .ilike(columnName, `${LOADTEST_TAG}%`);
    if (error) {
      throw error;
    }
  }
}

async function insertInChunks(supabase, tableName, rows, size = 200) {
  for (const batch of chunk(rows, size)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) {
      throw error;
    }
  }
}

async function ensureLoadtestPlans(supabase, gymId) {
  const desired = [
    {
      gym_id: gymId,
      name: `${LOADTEST_TAG} Open Gym Weekly`,
      price_cents: 4500,
      billing_interval: "weekly",
      is_active: true
    },
    {
      gym_id: gymId,
      name: `${LOADTEST_TAG} Semi-Private Coaching`,
      price_cents: 22000,
      billing_interval: "monthly",
      is_active: true
    }
  ];

  const { error } = await supabase.from("membership_plans").insert(desired);
  if (error) {
    throw error;
  }

  const plansResult = await supabase
    .from("membership_plans")
    .select("*")
    .eq("gym_id", gymId)
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  if (plansResult.error) {
    throw plansResult.error;
  }

  return plansResult.data ?? [];
}

async function seedLoadtestData() {
  const supabase = makeSupabaseClient();
  const loadtestMemberCount = getRequestedMemberCount();

  const gymUsersResult = await supabase.from("gym_users").select("*").eq("role", "owner");
  if (gymUsersResult.error) {
    throw gymUsersResult.error;
  }

  const ownerGymUser = gymUsersResult.data?.[0];
  if (!ownerGymUser) {
    throw new Error("No owner gym user found.");
  }

  const gymId = ownerGymUser.gym_id;
  const ownerUserId = ownerGymUser.user_id;

  const currentMemberResult = await supabase
    .from("members")
    .select("*")
    .eq("gym_id", gymId)
    .eq("email", "sabastianangulo@gmail.com")
    .maybeSingle();
  if (currentMemberResult.error) {
    throw currentMemberResult.error;
  }
  const currentMember = currentMemberResult.data;

  await cleanupExistingLoadtestData(supabase, gymId);

  const planPool = await ensureLoadtestPlans(supabase, gymId);
  const memberSpecs = Array.from({ length: loadtestMemberCount }, (_, index) =>
    createMemberSpec(index, planPool)
  );

  const memberRows = memberSpecs.map((spec) => ({
    gym_id: gymId,
    first_name: spec.firstName,
    last_name: spec.lastName,
    email: spec.email,
    phone: spec.phone,
    stripe_customer_id: spec.stripeCustomerId,
    stripe_default_payment_method_id: spec.stripePaymentMethodId,
    status: spec.status,
    frozen_until: spec.frozenUntil,
    canceled_at: spec.canceledAt,
    joined_at: spec.joinedAt,
    created_at: spec.joinedAt,
    updated_at: spec.joinedAt
  }));

  const insertedMembersResult = await supabase
    .from("members")
    .insert(memberRows)
    .select("*");
  if (insertedMembersResult.error) {
    throw insertedMembersResult.error;
  }
  const insertedMembers = insertedMembersResult.data ?? [];
  const memberByEmail = new Map(insertedMembers.map((member) => [member.email, member]));

  const subscriptions = [];
  const payments = [];
  const checkIns = [];
  const workouts = [];
  const workoutSets = [];
  const notes = [];
  const tasks = [];
  const notifications = [];
  const membershipEvents = [];
  const reminders = [];
  const memberScores = [];
  const insights = [];

  for (const spec of memberSpecs) {
    const member = memberByEmail.get(spec.email);
    if (!member) continue;

    let visitCount = 0;
    let workoutCount = 0;

    if (spec.subscriptionStatus !== "none") {
      const subscriptionId = crypto.randomUUID();
      const periodStart = dateDaysAgo(12 + (spec.index % 12));
      const periodEnd =
        spec.subscriptionStatus === "canceled"
          ? dateDaysAgo(2 + (spec.index % 10))
          : dateDaysAhead(5 + (spec.index % 25));

      subscriptions.push({
        id: subscriptionId,
        gym_id: gymId,
        member_id: member.id,
        membership_plan_id: spec.plan.id,
        status: spec.subscriptionStatus,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: spec.subscriptionStatus === "canceled",
        stripe_subscription_id: spec.stripeCustomerId
          ? `sub_loadtest_${String(spec.index + 1).padStart(3, "0")}`
          : null,
        created_at: dateDaysAgo(20 + (spec.index % 60)),
        updated_at: dateDaysAgo(spec.index % 7)
      });

      const amount = currencyAmountForPlan(spec.plan);
      const successPaymentCount =
        spec.subscriptionStatus === "trialing"
          ? 0
          : spec.subscriptionStatus === "canceled"
            ? 1
            : spec.subscriptionStatus === "past_due"
              ? 1
              : 2 + (spec.index % 2);

      for (let paymentIndex = 0; paymentIndex < successPaymentCount; paymentIndex += 1) {
        const createdAt = dateDaysAgo(
          3 + paymentIndex * 28 + (spec.index % 6),
          10 + paymentIndex
        );
        payments.push({
          gym_id: gymId,
          member_id: member.id,
          subscription_id: subscriptionId,
          amount_cents: amount,
          status: "succeeded",
          paid_at: createdAt,
          stripe_payment_intent_id: `pi_loadtest_${spec.index + 1}_${paymentIndex + 1}`,
          stripe_invoice_id: `in_loadtest_${spec.index + 1}_${paymentIndex + 1}`,
          created_at: createdAt
        });
      }

      if (spec.subscriptionStatus === "past_due") {
        const failedAt = dateDaysAgo(1 + (spec.index % 4), 11);
        payments.push({
          gym_id: gymId,
          member_id: member.id,
          subscription_id: subscriptionId,
          amount_cents: amount,
          status: "failed",
          paid_at: null,
          stripe_payment_intent_id: `pi_loadtest_fail_${spec.index + 1}`,
          stripe_invoice_id: `in_loadtest_fail_${spec.index + 1}`,
          created_at: failedAt
        });
      } else if (spec.subscriptionStatus === "trialing") {
        const pendingAt = dateDaysAgo(1 + (spec.index % 3), 14);
        payments.push({
          gym_id: gymId,
          member_id: member.id,
          subscription_id: subscriptionId,
          amount_cents: amount,
          status: "pending",
          paid_at: null,
          stripe_payment_intent_id: `pi_loadtest_pending_${spec.index + 1}`,
          stripe_invoice_id: `in_loadtest_pending_${spec.index + 1}`,
          created_at: pendingAt
        });
      }
    }

    if (spec.status === "frozen") {
      membershipEvents.push({
        gym_id: gymId,
        member_id: member.id,
        event_type: "frozen",
        reason: "Temporary travel freeze",
        frozen_until: spec.frozenUntil,
        created_at: dateDaysAgo(2 + (spec.index % 8))
      });
      const frozenDaysRemaining = Math.max(
        1,
        Math.ceil(
          (new Date(spec.frozenUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      );
      if (frozenDaysRemaining <= 7) {
        reminders.push({
          gym_id: gymId,
          member_id: member.id,
          reminder_type: frozenDaysRemaining <= 2 ? "two_days" : "one_week",
          frozen_until: spec.frozenUntil,
          created_at: dateDaysAgo(1)
        });
      }
    }

    if (spec.status === "canceled") {
      membershipEvents.push({
        gym_id: gymId,
        member_id: member.id,
        event_type: "canceled",
        reason: "Completed cancellation flow",
        frozen_until: null,
        created_at: spec.canceledAt
      });
    }

    if (spec.engagement === "high") {
      visitCount = 12 + (spec.index % 10);
      workoutCount = 3 + (spec.index % 4);
    } else if (spec.engagement === "steady") {
      visitCount = 6 + (spec.index % 6);
      workoutCount = 1 + (spec.index % 3);
    } else if (spec.engagement === "ramping") {
      visitCount = 3 + (spec.index % 4);
      workoutCount = 1 + (spec.index % 2);
    } else if (spec.engagement === "dropping") {
      visitCount = 1 + (spec.index % 3);
      workoutCount = spec.index % 2;
    } else if (spec.engagement === "low") {
      visitCount = 2 + (spec.index % 2);
      workoutCount = spec.index % 2;
    }

    for (let visitIndex = 0; visitIndex < visitCount; visitIndex += 1) {
      const daysAgo =
        spec.engagement === "dropping"
          ? 8 + visitIndex * 7 + (spec.index % 4)
          : spec.engagement === "low"
            ? 10 + visitIndex * 9
            : 1 + visitIndex * (spec.engagement === "high" ? 2 : 4);
      checkIns.push({
        gym_id: gymId,
        member_id: member.id,
        check_in_method: visitIndex % 3 === 0 ? "qr" : "manual",
        created_at: dateDaysAgo(daysAgo, 6 + (visitIndex % 10))
      });
    }

    for (let workoutIndex = 0; workoutIndex < workoutCount; workoutIndex += 1) {
      const workoutId = crypto.randomUUID();
      const performedAt = dateDaysAgo(
        2 + workoutIndex * (spec.engagement === "high" ? 4 : 8) + (spec.index % 4),
        7 + workoutIndex
      );
      workouts.push({
        id: workoutId,
        gym_id: gymId,
        member_id: member.id,
        title: `${randomItem(EXERCISES, spec.index + workoutIndex)} Session`,
        notes: workoutIndex % 2 === 0 ? "Felt strong today." : null,
        performed_at: performedAt,
        created_at: performedAt
      });
      const setCount = 2 + ((spec.index + workoutIndex) % 3);
      for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
        workoutSets.push({
          workout_id: workoutId,
          exercise_name: randomItem(EXERCISES, spec.index + workoutIndex + setIndex),
          set_index: setIndex + 1,
          reps: 5 + ((spec.index + setIndex) % 8),
          weight: 95 + ((spec.index * 7 + setIndex * 15) % 225),
          created_at: performedAt
        });
      }
    }

    if (spec.index % 3 === 0) {
      notes.push({
        gym_id: gymId,
        member_id: member.id,
        author_user_id: ownerUserId,
        body:
          spec.subscriptionStatus === "past_due"
            ? "Billing needs follow-up before next attendance push."
            : "Strong gym fit. Keep a close eye on attendance and recovery.",
        is_archived: spec.index % 9 === 0,
        created_at: dateDaysAgo(1 + (spec.index % 20)),
        updated_at: dateDaysAgo(spec.index % 6)
      });
    }

    if (spec.index % 4 === 0) {
      tasks.push({
        gym_id: gymId,
        member_id: member.id,
        author_user_id: ownerUserId,
        title:
          spec.subscriptionStatus === "past_due"
            ? "Recover past due payment"
            : spec.engagement === "dropping"
              ? "Reach out after attendance drop"
              : "General floor check-in",
        details:
          spec.engagement === "high"
            ? "Good candidate for an upsell conversation."
            : "Follow up with a personalized touchpoint.",
        task_type:
          spec.subscriptionStatus === "past_due"
            ? "billing"
            : spec.engagement === "dropping"
              ? "retention"
              : "front_desk",
        priority:
          spec.subscriptionStatus === "past_due"
            ? "high"
            : spec.engagement === "high"
              ? "medium"
              : "low",
        status: spec.index % 8 === 0 ? "completed" : "open",
        due_at: spec.index % 8 === 0 ? null : dateDaysAhead(1 + (spec.index % 5)),
        completed_at: spec.index % 8 === 0 ? dateDaysAgo(spec.index % 4) : null,
        created_at: dateDaysAgo(1 + (spec.index % 14)),
        updated_at: dateDaysAgo(spec.index % 5)
      });
    }

    if (spec.index % 2 === 0) {
      const notificationType =
        spec.subscriptionStatus === "past_due"
          ? "billing"
          : spec.engagement === "dropping"
            ? "retention"
            : spec.engagement === "high"
              ? "workout"
              : "general";

      notifications.push({
        gym_id: gymId,
        member_id: member.id,
        title:
          notificationType === "billing"
            ? "Payment needs attention"
            : notificationType === "retention"
              ? "We miss seeing you"
              : notificationType === "workout"
                ? "Strong week"
                : "Club update",
        body:
          notificationType === "billing"
            ? "Your next membership payment needs a retry."
            : notificationType === "retention"
              ? "Let’s get you back in for a session this week."
              : notificationType === "workout"
                ? "You’ve had a strong run lately. Keep it going."
                : "Check the latest club notes and challenge updates.",
        type: notificationType,
        status: spec.index % 10 === 0 ? "failed" : "sent",
        created_at: dateDaysAgo(spec.index % 12, 9 + (spec.index % 6)),
        read_at:
          spec.index % 5 === 0 ? null : dateDaysAgo(Math.max(0, (spec.index % 12) - 1), 15)
      });
    }

    const engagementScore =
      spec.engagement === "high"
        ? 84 + (spec.index % 10)
        : spec.engagement === "steady"
          ? 62 + (spec.index % 12)
          : spec.engagement === "ramping"
            ? 58 + (spec.index % 10)
            : spec.engagement === "dropping"
              ? 28 + (spec.index % 12)
              : spec.engagement === "low"
                ? 36 + (spec.index % 10)
                : 18 + (spec.index % 8);
    const retentionRisk =
      spec.subscriptionStatus === "past_due"
        ? 78 + (spec.index % 12)
        : spec.engagement === "dropping"
          ? 74 + (spec.index % 8)
          : spec.status === "lead"
            ? 68 + (spec.index % 10)
            : spec.status === "frozen"
              ? 55 + (spec.index % 10)
              : spec.engagement === "high"
                ? 18 + (spec.index % 12)
                : 42 + (spec.index % 14);

    memberScores.push({
      gym_id: gymId,
      member_id: member.id,
      engagement_score: Math.min(100, engagementScore),
      retention_risk_score: Math.min(100, retentionRisk),
      last_calculated_at: new Date().toISOString()
    });

    if (spec.subscriptionStatus === "past_due") {
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "failed_payment",
        title: `${member.first_name} ${member.last_name} has a failed payment`,
        description: "A recent payment attempt failed and needs recovery.",
        priority: "high",
        status: "open",
        created_at: dateDaysAgo(1)
      });
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "revenue_leak",
        title: `${member.first_name} ${member.last_name} has a past-due subscription`,
        description: "Billing is stalled on an assigned subscription.",
        priority: "high",
        status: "open",
        created_at: dateDaysAgo(1)
      });
    } else if (spec.engagement === "dropping") {
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "inactivity",
        title: `${member.first_name} ${member.last_name} has gone quiet`,
        description: "Attendance cooled off across the last week.",
        priority: "medium",
        status: "open",
        created_at: dateDaysAgo(2)
      });
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "retention_risk",
        title: `${member.first_name} ${member.last_name} is at high retention risk`,
        description: "Engagement softened and needs a recovery touchpoint.",
        priority: "high",
        status: "open",
        created_at: dateDaysAgo(2)
      });
    } else if (spec.status === "active" && spec.subscriptionStatus === "none") {
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "missing_subscription",
        title: `${member.first_name} ${member.last_name} is active without a subscription`,
        description: "This active member has no attached subscription.",
        priority: "high",
        status: "open",
        created_at: dateDaysAgo(1)
      });
    } else if (spec.engagement === "high") {
      insights.push({
        gym_id: gymId,
        member_id: member.id,
        type: "upsell_opportunity",
        title: `${member.first_name} ${member.last_name} looks ready for an upsell`,
        description: "Attendance and engagement are strong enough for a premium offer.",
        priority: "medium",
        status: "open",
        created_at: dateDaysAgo(3)
      });
    }
  }

  await insertInChunks(supabase, "subscriptions", subscriptions);
  await insertInChunks(supabase, "payments", payments);
  await insertInChunks(supabase, "check_ins", checkIns);
  await insertInChunks(supabase, "workouts", workouts);
  await insertInChunks(supabase, "workout_sets", workoutSets);
  await insertInChunks(supabase, "member_notes", notes);
  await insertInChunks(supabase, "member_follow_up_tasks", tasks);
  await insertInChunks(supabase, "notifications", notifications);
  await insertInChunks(supabase, "member_membership_events", membershipEvents);
  if (reminders.length > 0) {
    await insertInChunks(supabase, "member_freeze_reminders", reminders);
  }
  await insertInChunks(supabase, "member_scores", memberScores);
  await insertInChunks(supabase, "ai_insights", insights);

  if (currentMember) {
    const acceptedFriends = insertedMembers.slice(0, 5).map((member, index) => ({
      gym_id: gymId,
      sender_member_id: currentMember.id,
      receiver_member_id: member.id,
      status: "accepted",
      created_at: dateDaysAgo(10 + index),
      updated_at: dateDaysAgo(9 + index)
    }));
    const pendingFriends = insertedMembers.slice(5, 10).map((member, index) => ({
      gym_id: gymId,
      sender_member_id: member.id,
      receiver_member_id: currentMember.id,
      status: "pending",
      created_at: dateDaysAgo(3 + index),
      updated_at: dateDaysAgo(3 + index)
    }));
    await insertInChunks(supabase, "friend_requests", [...acceptedFriends, ...pendingFriends]);
  }

  const internalFriendLinks = insertedMembers.slice(10, 30).flatMap((member, index) => {
    const next = insertedMembers[30 + index];
    if (!next) return [];
    return [
      {
        gym_id: gymId,
        sender_member_id: member.id,
        receiver_member_id: next.id,
        status: index % 4 === 0 ? "pending" : "accepted",
        created_at: dateDaysAgo(8 + index),
        updated_at: dateDaysAgo(7 + index)
      }
    ];
  });
  await insertInChunks(supabase, "friend_requests", internalFriendLinks);

  const communityPosts = insertedMembers.slice(0, 24).map((member, index) => ({
    gym_id: gymId,
    member_id: member.id,
    body:
      index % 5 === 0
        ? `${LOADTEST_TAG} Hit a big lower-body day and felt strong today.`
        : index % 3 === 0
          ? `${LOADTEST_TAG} Dialing in consistency this month.`
          : `${LOADTEST_TAG} Locked in another session at the club.`,
    image_url: null,
    visibility: index % 4 === 0 ? "gym_feed" : "friends_only",
    is_auto_generated: false,
    metadata: {},
    created_at: dateDaysAgo(1 + index)
  }));
  const communityPostsResult = await supabase
    .from("community_posts")
    .insert(communityPosts)
    .select("*");
  if (communityPostsResult.error) {
    throw communityPostsResult.error;
  }

  const createdPosts = communityPostsResult.data ?? [];
  const postComments = createdPosts.slice(0, 12).map((post, index) => ({
    post_id: post.id,
    member_id:
      insertedMembers[(index + 40) % insertedMembers.length].id,
    body:
      index % 2 === 0
        ? `${LOADTEST_TAG} Nice work.`
        : `${LOADTEST_TAG} Strong session. Keep it rolling.`,
    created_at: dateDaysAgo(index)
  }));
  await insertInChunks(supabase, "post_comments", postComments);

  const shoutouts = insertedMembers.slice(0, 4).map((member, index) => ({
    gym_id: gymId,
    member_id: member.id,
    title: `${LOADTEST_TAG} Shoutout ${index + 1}`,
    body: `${member.first_name} has been showing up consistently and pushing the room forward.`,
    created_by_user_id: ownerUserId,
    is_pinned: index === 0,
    expires_at: index === 0 ? null : dateDaysAhead(10 + index),
    created_at: dateDaysAgo(index + 1)
  }));
  await insertInChunks(supabase, "gym_shoutouts", shoutouts);

  const spotlights = insertedMembers.slice(0, 3).map((member, index) => ({
    gym_id: gymId,
    member_id: member.id,
    title: `${LOADTEST_TAG} Member spotlight ${index + 1}`,
    body: `${member.first_name} ${member.last_name} has been building serious momentum and setting the tone in training.`,
    image_url: null,
    status: "active",
    created_by_user_id: ownerUserId,
    created_at: dateDaysAgo(index + 2)
  }));
  await insertInChunks(supabase, "gym_member_spotlights", spotlights);

  const announcements = [
    {
      gym_id: gymId,
      title: `${LOADTEST_TAG} New onboarding week`,
      body: "Expect heavier first-week front desk volume and extra lead follow-up.",
      is_pinned: true,
      is_active: true,
      created_at: dateDaysAgo(1),
      updated_at: dateDaysAgo(1)
    },
    {
      gym_id: gymId,
      title: `${LOADTEST_TAG} Recovery room maintenance`,
      body: "Recovery stations are scheduled for cleaning and light maintenance this Friday.",
      is_pinned: false,
      is_active: true,
      created_at: dateDaysAgo(3),
      updated_at: dateDaysAgo(3)
    }
  ];
  await insertInChunks(supabase, "gym_announcements", announcements);

  const challenges = CHALLENGE_DEFS.map((challenge, index) => ({
    gym_id: gymId,
    title: challenge.title,
    description: challenge.description,
    metric_type: challenge.metric_type,
    goal_value: challenge.goal_value,
    period: challenge.period,
    starts_on: index === 0 ? dateOnlyDaysAgo(2) : dateOnlyDaysAgo(12),
    ends_on: index === 0 ? dateOnlyDaysAhead(5) : dateOnlyDaysAhead(18),
    status: "active",
    created_at: dateDaysAgo(index + 1),
    updated_at: dateDaysAgo(index + 1)
  }));
  await insertInChunks(supabase, "gym_challenges", challenges);

  const fridgeProducts = PRODUCT_DEFS.map(([category, name, price], index) => ({
    gym_id: gymId,
    category,
    name: `${LOADTEST_TAG} ${name}`,
    description: "Seeded product for realistic front desk and wallet testing.",
    price_cents: price,
    is_active: true,
    sort_order: index,
    created_at: dateDaysAgo(index + 1),
    updated_at: dateDaysAgo(index + 1)
  }));
  await insertInChunks(supabase, "fridge_products", fridgeProducts);

  const summary = {
    gymId,
    requestedLoadtestMembers: loadtestMemberCount,
    seededMembers: insertedMembers.length,
    seededSubscriptions: subscriptions.length,
    seededPayments: payments.length,
    seededCheckIns: checkIns.length,
    seededWorkouts: workouts.length,
    seededWorkoutSets: workoutSets.length,
    seededNotes: notes.length,
    seededTasks: tasks.length,
    seededNotifications: notifications.length,
    seededInsights: insights.length,
    seededFriendRequests: (currentMember ? 10 : 0) + internalFriendLinks.length,
    seededCommunityPosts: communityPosts.length
  };

  console.log(JSON.stringify(summary, null, 2));
}

seedLoadtestData().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
