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

function parseCount(contentRange) {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function headCount(url, headers) {
  const response = await fetch(url, {
    method: "HEAD",
    headers
  });

  if (response.status >= 400) {
    throw new Error(`${url} failed with ${response.status}`);
  }

  return parseCount(response.headers.get("content-range"));
}

async function main() {
  const iterations = Number(process.argv[2] ?? 4);
  const env = readEnv(path.join(process.cwd(), ".env.local"));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const rest = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: "count=exact"
  };

  const gymsResponse = await fetch(`${rest}/gyms?select=id,name,slug`, {
    headers
  });
  const gyms = await gymsResponse.json();

  if (!Array.isArray(gyms) || gyms.length === 0) {
    throw new Error("No gyms found for multi-tenant stress.");
  }

  const samples = [];

  for (let round = 0; round < iterations; round += 1) {
    const startedAt = Date.now();

    const roundResult = await Promise.all(
      gyms.map(async (gym) => {
        const [members, subscriptions, payments, checkIns] = await Promise.all([
          headCount(`${rest}/members?gym_id=eq.${gym.id}&select=*`, headers),
          headCount(`${rest}/subscriptions?gym_id=eq.${gym.id}&select=*`, headers),
          headCount(`${rest}/payments?gym_id=eq.${gym.id}&select=*`, headers),
          headCount(`${rest}/check_ins?gym_id=eq.${gym.id}&select=*`, headers)
        ]);

        return {
          gymId: gym.id,
          gymName: gym.name,
          members,
          subscriptions,
          payments,
          checkIns
        };
      })
    );

    samples.push({
      round: round + 1,
      durationMs: Date.now() - startedAt,
      gyms: roundResult
    });
  }

  const averageDurationMs =
    samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length;

  const summary = {
    gymCount: gyms.length,
    iterations,
    averageDurationMs: Math.round(averageDurationMs),
    samples,
    pass: gyms.length >= 2 && averageDurationMs < 5000
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
