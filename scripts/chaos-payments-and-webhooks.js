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

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  const baseUrl = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
  const env = readEnv(path.join(process.cwd(), ".env.local"));
  const { createClient } = await import("@supabase/supabase-js");
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
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

  const subscriptionsResult = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .not("stripe_subscription_id", "is", null)
    .limit(5000);

  if (subscriptionsResult.error) {
    throw subscriptionsResult.error;
  }

  const liveSubscriptionId = (subscriptionsResult.data ?? [])
    .map((row) => row.stripe_subscription_id)
    .find(
      (value) =>
        typeof value === "string" &&
        !value.startsWith("sub_scale_") &&
        !value.startsWith("sub_loadtest_")
    );

  if (!liveSubscriptionId) {
    throw new Error("No live Stripe subscription found for chaos test.");
  }

  const gymResult = await supabase
    .from("gyms")
    .select("stripe_connected_account_id")
    .not("stripe_connected_account_id", "is", null)
    .limit(1)
    .single();

  if (gymResult.error || !gymResult.data?.stripe_connected_account_id) {
    throw gymResult.error ?? new Error("No Stripe connected gym found for chaos test.");
  }

  const subscription = await stripe.subscriptions.retrieve(liveSubscriptionId);
  const invoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id ?? null;

  if (!invoiceId) {
    throw new Error("No live Stripe invoice found for chaos test.");
  }

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const account = await stripe.accounts.retrieve(gymResult.data.stripe_connected_account_id);

  const sendWebhook = async (event) => {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET
    });

    return fetchJson(`${baseUrl}/api/stripe/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": header
      },
      body: payload
    });
  };

  const malformed = await fetchJson(`${baseUrl}/api/stripe/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "bad_signature"
    },
    body: JSON.stringify({ hello: "world" })
  });

  const paymentRowsBefore = await supabase
    .from("payments")
    .select("id", { count: "exact" })
    .eq("stripe_invoice_id", invoice.id);

  const subscriptionEvent = {
    id: `evt_chaos_subscription_${Date.now()}`,
    object: "event",
    type: "customer.subscription.updated",
    data: { object: subscription }
  };

  const invoiceEvent = {
    id: `evt_chaos_invoice_${Date.now()}`,
    object: "event",
    type: invoice.status === "paid" ? "invoice.paid" : "invoice.payment_failed",
    data: { object: invoice }
  };

  const accountEvent = {
    id: `evt_chaos_account_${Date.now()}`,
    object: "event",
    type: "account.updated",
    data: { object: account }
  };

  const subscriptionFirst = await sendWebhook(subscriptionEvent);
  const subscriptionDuplicate = await sendWebhook(subscriptionEvent);
  const invoiceFirst = await sendWebhook(invoiceEvent);
  const invoiceRepeat = await sendWebhook(invoiceEvent);
  const accountFirst = await sendWebhook(accountEvent);

  const paymentRowsAfter = await supabase
    .from("payments")
    .select("id", { count: "exact" })
    .eq("stripe_invoice_id", invoice.id);

  const summary = {
    malformed,
    subscriptionFirst,
    subscriptionDuplicate,
    invoiceFirst,
    invoiceRepeat,
    accountFirst,
    paymentRowsBefore: paymentRowsBefore.count ?? null,
    paymentRowsAfter: paymentRowsAfter.count ?? null,
    pass:
      malformed.status === 400 &&
      subscriptionFirst.status === 200 &&
      subscriptionDuplicate.status === 200 &&
      subscriptionFirst.body?.received === true &&
      subscriptionDuplicate.body?.duplicate === true &&
      invoiceFirst.status === 200 &&
      invoiceRepeat.status === 200 &&
      invoiceRepeat.body?.duplicate === true &&
      accountFirst.status === 200 &&
      (paymentRowsAfter.count ?? 0) <= 1
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
