const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns/promises");

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

async function time(label, fn) {
  const start = Date.now();
  const result = await fn();
  return {
    label,
    durationMs: Date.now() - start,
    result
  };
}

function extractErrorText(error) {
  if (error instanceof Error) {
    return `${error.message} ${error.stack ?? ""}`;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    return [
      error.message,
      error.details,
      error.hint,
      error.code,
      error.error_description
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function isTransientNetworkError(error) {
  const message = extractErrorText(error);

  return [
    "fetch failed",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "network",
    "Failed to fetch"
  ].some((fragment) => message.includes(fragment));
}

async function withRetry(fn, options = {}) {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  let attempt = 0;
  let lastError = null;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= retries || !isTransientNetworkError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError ?? new Error("Operation failed after retries.");
}

function withTimeout(init, timeoutMs = 30000) {
  return {
    ...(init ?? {}),
    signal: AbortSignal.timeout(timeoutMs)
  };
}

async function fetchText(url, init) {
  const response = await withRetry(async () => {
    try {
      return await fetch(url, withTimeout(init));
    } catch (error) {
      throw new Error(`fetchText failed for ${url}: ${extractErrorText(error)}`);
    }
  });
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text()
  };
}

async function fetchJson(url, init) {
  const response = await withRetry(async () => {
    try {
      return await fetch(url, withTimeout(init));
    } catch (error) {
      throw new Error(`fetchJson failed for ${url}: ${extractErrorText(error)}`);
    }
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

function parseCountFromContentRange(contentRange) {
  if (!contentRange) {
    return null;
  }

  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function restCount(restBaseUrl, table, serviceRoleKey) {
  const result = await fetchText(
    `${restBaseUrl}/${table}?select=*`,
    {
      method: "HEAD",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact"
      }
    }
  );

  if (result.status >= 400) {
    throw new Error(`Count query failed for ${table}: ${result.status}`);
  }

  return parseCountFromContentRange(result.headers.get("content-range"));
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

async function main() {
  const root = process.cwd();
  const rootEnv = readEnv(path.join(root, ".env.local"));
  const memberEnv = readEnv(path.join(root, "member-app", ".env"));

  const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
  const memberWebUrl = (process.argv[3] || "http://localhost:19007").replace(/\/$/, "");
  const supabaseUrl = rootEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const restBaseUrl = `${supabaseUrl}/rest/v1`;
  const anonKey = rootEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = rootEnv.SUPABASE_SERVICE_ROLE_KEY;

  const summary = {
    baseUrl,
    memberWebUrl,
    checks: []
  };

  const supabaseHost = new URL(supabaseUrl).hostname;
  try {
    await withRetry(() => dns.lookup(supabaseHost), {
      retries: 2,
      delayMs: 500
    });
  } catch (error) {
    throw {
      message: `Supabase host lookup failed for ${supabaseHost}. The project may be paused or the URL may be stale.`,
      details: extractErrorText(error)
    };
  }

  const tableCounts = {};
  const countTables = [
    "members",
    "subscriptions",
    "payments",
    "check_ins",
    "notifications",
    "member_follow_up_tasks",
    "fridge_products"
  ];
  for (const table of countTables) {
    try {
      tableCounts[table] = await restCount(restBaseUrl, table, serviceRoleKey);
    } catch (error) {
      tableCounts[table] = null;
      summary.datasetWarning = `Dataset counts unavailable for one or more tables: ${extractErrorText(
        error
      )}`;
      break;
    }
  }
  summary.dataset = tableCounts;

  for (const url of [
    `${baseUrl}/dashboard`,
    `${baseUrl}/dashboard/members`,
    `${baseUrl}/dashboard/front-desk`,
    `${baseUrl}/dashboard/revenue`,
    `${baseUrl}/dashboard/reports`,
    memberWebUrl
  ]) {
    summary.checks.push(
      await time(url, async () => {
        const response = await withRetry(async () => {
          try {
            return await fetch(url, withTimeout(undefined, 20000));
          } catch (error) {
            throw new Error(`route check failed for ${url}: ${extractErrorText(error)}`);
          }
        });
        return { status: response.status };
      })
    );
  }

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

  summary.checks.push(
    await time("billing-summary", async () => ({
      expectedStatus: 200,
      ...(await fetchJson(`${baseUrl}/api/member-billing`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }))
    }))
  );

  summary.checks.push(
    await time("freeze-membership", async () => ({
      expectedStatus: 200,
      ...(await fetchJson(`${baseUrl}/api/member-billing/freeze`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ weeks: 4 })
      }))
    }))
  );

  summary.checks.push(
    await time("resume-membership", async () => ({
      expectedStatus: 200,
      ...(await fetchJson(`${baseUrl}/api/member-billing/resume`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }))
    }))
  );

  const walletProductsResult = await fetchJson(`${baseUrl}/api/fridge/products`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (
    walletProductsResult.status >= 400 ||
    !Array.isArray(walletProductsResult.body) ||
    !walletProductsResult.body.length
  ) {
    throw new Error(
      `Wallet products lookup failed: ${walletProductsResult.status} ${JSON.stringify(
        walletProductsResult.body
      )}`
    );
  }

  const unlockSession = await rpc(
    restBaseUrl,
    "create_member_fridge_unlock_session",
    {
      selected_items_payload: [
        { productId: walletProductsResult.body[0].id, quantity: 1 }
      ],
      expires_in_seconds: 90
    },
    token,
    anonKey
  );

  const sessionPayload = Array.isArray(unlockSession)
    ? unlockSession[0]
    : unlockSession;

  summary.checks.push(
    await time("front-desk-scan", async () => ({
      expectedStatus: 200,
      ...(await fetchJson(`${baseUrl}/api/fridge/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          qrToken: sessionPayload.qr_token,
          scannerLabel: "Premium release validation"
        })
      }))
    }))
  );

  summary.checks.push(
    await time("wallet-confirm", async () => ({
      expectedStatus: 200,
      ...(await fetchJson(`${baseUrl}/api/fridge/confirm`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          sessionId: sessionPayload.id,
          selectedItems: [
            { productId: walletProductsResult.body[0].id, quantity: 1 }
          ]
        })
      }))
    }))
  );

  const checksPassed = summary.checks.every((check) => {
    const expectedStatus =
      typeof check.result?.expectedStatus === "number"
        ? check.result.expectedStatus
        : 200;
    return check.result?.status === expectedStatus && check.durationMs < 5000;
  });

  summary.pass = checksPassed;
  summary.memberApiBase = memberEnv.EXPO_PUBLIC_API_URL;

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
