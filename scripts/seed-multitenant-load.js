const fs = require("node:fs");
const path = require("node:path");

function readEnv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  return out;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function chunk(list, size) {
  const output = [];
  for (let index = 0; index < list.length; index += size) {
    output.push(list.slice(index, index + size));
  }
  return output;
}

async function insertInChunks(queryFactory, rows, size = 250) {
  for (const rowsChunk of chunk(rows, size)) {
    const result = await queryFactory(rowsChunk);
    if (result.error) {
      throw result.error;
    }
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const env = readEnv(path.join(process.cwd(), ".env.local"));
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  const specs = [
    { name: "Scale Lab Barbell East", members: 180 },
    { name: "Scale Lab Barbell West", members: 220 },
    { name: "Scale Lab Strength North", members: 260 }
  ];

  const summary = [];

  for (const spec of specs) {
    const slug = slugify(spec.name);
    const existingGymResult = await supabase
      .from("gyms")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (existingGymResult.error) {
      throw existingGymResult.error;
    }

    let gym = existingGymResult.data;

    if (!gym) {
      const gymInsert = await supabase
        .from("gyms")
        .insert({
          name: spec.name,
          slug,
          timezone: "America/Los_Angeles"
        })
        .select("id, name, slug")
        .single();

      if (gymInsert.error || !gymInsert.data) {
        throw gymInsert.error ?? new Error(`Could not create gym ${spec.name}.`);
      }

      gym = gymInsert.data;
    }

    const plansResult = await supabase
      .from("membership_plans")
      .select("id, name")
      .eq("gym_id", gym.id);

    if (plansResult.error) {
      throw plansResult.error;
    }

    let plans = plansResult.data ?? [];

    if (plans.length === 0) {
      const planInsert = await supabase
        .from("membership_plans")
        .insert([
          {
            gym_id: gym.id,
            name: "Unlimited",
            price_cents: 11900,
            billing_interval: "monthly",
            is_active: true
          },
          {
            gym_id: gym.id,
            name: "Open Gym",
            price_cents: 7900,
            billing_interval: "monthly",
            is_active: true
          }
        ])
        .select("id, name");

      if (planInsert.error) {
        throw planInsert.error;
      }

      plans = planInsert.data ?? [];
    }

    const existingMembersResult = await supabase
      .from("members")
      .select("id", {
        count: "exact"
      })
      .eq("gym_id", gym.id)
      .limit(1);

    if (existingMembersResult.error) {
      throw existingMembersResult.error;
    }

    const existingMemberCount = existingMembersResult.count ?? 0;
    const membersToCreate = Math.max(0, spec.members - existingMemberCount);

    if (membersToCreate > 0) {
      const now = Date.now();
      const members = Array.from({ length: membersToCreate }, (_, index) => {
        const seed = existingMemberCount + index + 1;
        return {
          gym_id: gym.id,
          first_name: `Scale${seed}`,
          last_name: "Member",
          email: `${slug}.member.${seed}@compoundos.local`,
          phone: `555000${String(seed).padStart(4, "0")}`.slice(0, 10),
          status: seed % 19 === 0 ? "frozen" : "active",
          joined_at: new Date(now - seed * 86400000).toISOString()
        };
      });

      await insertInChunks(
        (rowsChunk) => supabase.from("members").insert(rowsChunk),
        members
      );
    }

    const membersResult = await supabase
      .from("members")
      .select("id, status")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: true });

    if (membersResult.error) {
      throw membersResult.error;
    }

    const members = membersResult.data ?? [];
    const activePlanId = plans[0]?.id ?? null;

    const subscriptionsResult = await supabase
      .from("subscriptions")
      .select("member_id")
      .eq("gym_id", gym.id);

    if (subscriptionsResult.error) {
      throw subscriptionsResult.error;
    }

    const subscribedMemberIds = new Set((subscriptionsResult.data ?? []).map((row) => row.member_id));
    const newSubscriptions = members
      .filter((member) => !subscribedMemberIds.has(member.id))
      .map((member, index) => ({
        gym_id: gym.id,
        member_id: member.id,
        membership_plan_id: activePlanId,
        status: member.status === "frozen" ? "past_due" : "active",
        current_period_start: new Date(Date.now() - 7 * 86400000).toISOString(),
        current_period_end: new Date(Date.now() + 23 * 86400000).toISOString(),
        cancel_at_period_end: false,
        stripe_subscription_id: `sub_scale_${slug}_${index + 1}`
      }));

    if (newSubscriptions.length > 0) {
      await insertInChunks(
        (rowsChunk) => supabase.from("subscriptions").insert(rowsChunk),
        newSubscriptions
      );
    }

    const subscriptionsFullResult = await supabase
      .from("subscriptions")
      .select("id, member_id")
      .eq("gym_id", gym.id);

    if (subscriptionsFullResult.error) {
      throw subscriptionsFullResult.error;
    }

    const paymentsResult = await supabase
      .from("payments")
      .select("subscription_id")
      .eq("gym_id", gym.id);

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    const paidSubscriptionIds = new Set((paymentsResult.data ?? []).map((row) => row.subscription_id));
    const newPayments = [];
    const newCheckIns = [];

    for (const [index, subscription] of (subscriptionsFullResult.data ?? []).entries()) {
      if (!paidSubscriptionIds.has(subscription.id)) {
        newPayments.push({
          gym_id: gym.id,
          member_id: subscription.member_id,
          subscription_id: subscription.id,
          amount_cents: 11900,
          status: index % 13 === 0 ? "failed" : "succeeded",
          paid_at: new Date(Date.now() - (index % 10) * 86400000).toISOString(),
          stripe_payment_intent_id: `pi_scale_${slug}_${index + 1}`,
          stripe_invoice_id: `in_scale_${slug}_${index + 1}`
        });
      }

      for (let visit = 0; visit < 4; visit += 1) {
        newCheckIns.push({
          gym_id: gym.id,
          member_id: subscription.member_id,
          check_in_method: "qr",
          created_at: new Date(Date.now() - (visit + (index % 7)) * 86400000).toISOString()
        });
      }
    }

    if (newPayments.length > 0) {
      await insertInChunks(
        (rowsChunk) => supabase.from("payments").insert(rowsChunk),
        newPayments
      );
    }

    if (newCheckIns.length > 0) {
      await insertInChunks(
        (rowsChunk) => supabase.from("check_ins").insert(rowsChunk),
        newCheckIns
      );
    }

    summary.push({
      gymId: gym.id,
      name: gym.name,
      slug: gym.slug,
      members: members.length,
      plans: plans.length
    });
  }

  console.log(JSON.stringify({ seeded: summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
