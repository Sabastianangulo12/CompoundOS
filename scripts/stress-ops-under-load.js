const fs = require("node:fs");
const path = require("node:path");

function readEnv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const map = {};

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  return map;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body
  };
}

async function withRetries(run, options = {}) {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 150;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (!isRetriableNetworkError(error) || attempt === retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Retried operation failed.");
}

function isRetriableNetworkError(error) {
  const message =
    error instanceof Error ? `${error.message} ${(error.cause && error.cause.message) || ""}` : "";
  return /fetch failed|ECONNRESET|UND_ERR_SOCKET|socket/i.test(message);
}

async function rpc(restBaseUrl, fnName, payload, bearerToken, apiKey) {
  const result = await fetchJson(`${restBaseUrl}/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${bearerToken}`
    },
    body: JSON.stringify(payload)
  });

  if (result.status >= 400) {
    throw new Error(
      `RPC ${fnName} failed: ${result.status} ${JSON.stringify(result.body)}`
    );
  }

  return result.body;
}

async function passwordSignIn(supabaseUrl, anonKey, email, password) {
  const result = await fetchJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey
      },
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  if (result.status >= 400 || !result.body?.access_token) {
    throw new Error(
      `Password sign-in failed: ${result.status} ${JSON.stringify(result.body)}`
    );
  }

  return result.body;
}

async function time(fn) {
  const start = performance.now();
  const result = await fn();
  return {
    durationMs: Math.round(performance.now() - start),
    result
  };
}

function summarizeDurations(samples) {
  const sorted = [...samples].sort((a, b) => a - b);

  return {
    count: samples.length,
    minMs: sorted[0] ?? 0,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    averageMs:
      samples.length > 0
        ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
        : 0
  };
}

async function main() {
  const root = process.cwd();
  const rootEnv = readEnv(path.join(root, ".env.local"));
  const baseUrl = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
  const supabaseUrl = rootEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const restBaseUrl = `${supabaseUrl}/rest/v1`;
  const anonKey = rootEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const iterations = Number(process.argv[3] || 6);

  const session = await passwordSignIn(
    supabaseUrl,
    anonKey,
    "loadtest.member@compoundos.local",
    "CompoundMember!123"
  );
  const token = session.access_token;

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const walletProducts = await fetchJson(`${baseUrl}/api/fridge/products`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (
    walletProducts.status >= 400 ||
    !Array.isArray(walletProducts.body) ||
    walletProducts.body.length === 0
  ) {
    throw new Error(
      `Wallet products lookup failed: ${walletProducts.status} ${JSON.stringify(walletProducts.body)}`
    );
  }

  const targetProduct = walletProducts.body[0];
  const metrics = {
    dashboard: [],
    frontDesk: [],
    revenue: [],
    billingSummary: [],
    freeze: [],
    resume: [],
    unlockSession: [],
    scan: [],
    confirm: []
  };

  for (let index = 0; index < iterations; index += 1) {
    const dashboardResult = await time(() =>
      withRetries(() => fetch(`${baseUrl}/dashboard`))
    );
    metrics.dashboard.push(dashboardResult.durationMs);

    const frontDeskResult = await time(() =>
      withRetries(() => fetch(`${baseUrl}/dashboard/front-desk`))
    );
    metrics.frontDesk.push(frontDeskResult.durationMs);

    const revenueResult = await time(() =>
      withRetries(() => fetch(`${baseUrl}/dashboard/revenue`))
    );
    metrics.revenue.push(revenueResult.durationMs);

    const billingSummaryResult = await time(() =>
      withRetries(() =>
        fetchJson(`${baseUrl}/api/member-billing`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      )
    );
    if (billingSummaryResult.result.status !== 200) {
      throw new Error(`Billing summary failed on iteration ${index + 1}`);
    }
    metrics.billingSummary.push(billingSummaryResult.durationMs);

    const freezeResult = await time(() =>
      withRetries(() =>
        fetchJson(`${baseUrl}/api/member-billing/freeze`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ weeks: 4 })
        })
      )
    );
    if (freezeResult.result.status !== 200) {
      throw new Error(`Freeze failed on iteration ${index + 1}`);
    }
    metrics.freeze.push(freezeResult.durationMs);

    const resumeResult = await time(() =>
      withRetries(() =>
        fetchJson(`${baseUrl}/api/member-billing/resume`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      )
    );
    if (resumeResult.result.status !== 200) {
      throw new Error(`Resume failed on iteration ${index + 1}`);
    }
    metrics.resume.push(resumeResult.durationMs);

    const unlockResult = await time(() =>
      rpc(
        restBaseUrl,
        "create_member_fridge_unlock_session",
        {
          selected_items_payload: [{ productId: targetProduct.id, quantity: 1 }],
          expires_in_seconds: 90
        },
        token,
        anonKey
      )
    );
    metrics.unlockSession.push(unlockResult.durationMs);

    const unlockSession = Array.isArray(unlockResult.result)
      ? unlockResult.result[0]
      : unlockResult.result;

    const scanResult = await time(() =>
      withRetries(() =>
        fetchJson(`${baseUrl}/api/fridge/scan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            qrToken: unlockSession.qr_token,
            scannerLabel: `Stress iteration ${index + 1}`
          })
        })
      )
    );
    if (scanResult.result.status !== 200) {
      throw new Error(`Front-desk scan failed on iteration ${index + 1}`);
    }
    metrics.scan.push(scanResult.durationMs);

    const confirmResult = await time(() =>
      withRetries(() =>
        fetchJson(`${baseUrl}/api/fridge/confirm`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            sessionId: unlockSession.id,
            selectedItems: [{ productId: targetProduct.id, quantity: 1 }]
          })
        })
      )
    );
    if (confirmResult.result.status !== 200 || confirmResult.result.body?.status !== "paid") {
      throw new Error(`Wallet confirm failed on iteration ${index + 1}`);
    }
    metrics.confirm.push(confirmResult.durationMs);
  }

  const summary = Object.fromEntries(
    Object.entries(metrics).map(([key, samples]) => [key, summarizeDurations(samples)])
  );

  console.log(
    JSON.stringify(
      {
        baseUrl,
        iterations,
        targetProduct: {
          id: targetProduct.id,
          name: targetProduct.name
        },
        summary
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
