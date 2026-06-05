type OpsLevel = "debug" | "info" | "warn" | "error";

type OpsFields = Record<string, unknown>;

export type OpsRequestContext = {
  requestId: string;
  operation: string;
  startedAtMs: number;
};

export function createOpsRequestContext(operation: string): OpsRequestContext {
  return {
    requestId: crypto.randomUUID(),
    operation,
    startedAtMs: Date.now()
  };
}

export function getDurationMs(context: OpsRequestContext) {
  return Date.now() - context.startedAtMs;
}

export function serializeError(error: unknown): OpsFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? null
    };
  }

  if (typeof error === "string") {
    return {
      errorMessage: error
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;

    return {
      errorMessage:
        typeof candidate.message === "string"
          ? candidate.message
          : JSON.stringify(candidate),
      errorCode: candidate.code ?? null,
      errorDetails: candidate.details ?? null,
      errorHint: candidate.hint ?? null
    };
  }

  return {
    errorMessage: "Unknown error"
  };
}

export function logOpsEvent(level: OpsLevel, event: string, fields: OpsFields = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}

export async function withRetries<T>(
  label: string,
  run: () => Promise<T>,
  options?: {
    retries?: number;
    delayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    context?: Partial<OpsRequestContext> & OpsFields;
  }
) {
  const retries = options?.retries ?? 3;
  const delayMs = options?.delayMs ?? 400;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < retries) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      attempt += 1;

      const shouldRetry = options?.shouldRetry ? options.shouldRetry(error) : false;

      logOpsEvent(attempt >= retries || !shouldRetry ? "error" : "warn", label, {
        attempt,
        retries,
        ...options?.context,
        ...serializeError(error)
      });

      if (attempt >= retries || !shouldRetry) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError ?? new Error(`${label} failed after retries.`);
}

export function isTransientRemoteError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.message} ${error.stack ?? ""}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return [
    "fetch failed",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "socket",
    "timeout",
    "temporarily unavailable"
  ].some((fragment) => message.includes(fragment));
}
