const baseUrl = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");

function isTransientNetworkError(error) {
  const text =
    error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);

  return ["fetch failed", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "socket"].some(
    (fragment) => text.includes(fragment)
  );
}

async function withRetry(run, retries = 3, delayMs = 400) {
  let attempt = 0;
  let lastError = null;

  while (attempt < retries) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= retries || !isTransientNetworkError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

async function fetchJson(url) {
  const response = await withRetry(() => fetch(url));
  const body = await response.json().catch(() => null);
  return {
    status: response.status,
    body
  };
}

async function main() {
  const health = await fetchJson(`${baseUrl}/api/ops/health`);
  const readiness = await fetchJson(`${baseUrl}/api/ops/readiness`);

  const summary = {
    baseUrl,
    health,
    readiness,
    pass: health.status === 200 && readiness.status === 200
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
