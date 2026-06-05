import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, getMissingEnvVars } from "@/lib/env";
import {
  createOpsRequestContext,
  getDurationMs,
  isTransientRemoteError,
  logOpsEvent,
  serializeError,
  withRetries
} from "@/lib/observability";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL"
];

export async function GET() {
  const context = createOpsRequestContext("ops-readiness");
  const missingEnv = getMissingEnvVars(requiredEnv);
  const checks: Record<string, unknown> = {
    env: {
      ok: missingEnv.length === 0,
      missing: missingEnv
    }
  };

  let statusCode = missingEnv.length === 0 ? 200 : 503;

  if (missingEnv.length === 0) {
    try {
      const supabase = createSupabaseAdminClient();
      const supabaseResult = await withRetries(
        "ops-readiness-supabase",
        async () =>
          supabase.from("gyms").select("id", {
            count: "exact"
          }).limit(1),
        {
          retries: 3,
          delayMs: 300,
          shouldRetry: isTransientRemoteError,
          context
        }
      );

      checks.supabase = {
        ok: !supabaseResult.error,
        count: supabaseResult.count ?? null
      };

      if (supabaseResult.error) {
        statusCode = 503;
      }
    } catch (error) {
      checks.supabase = {
        ok: false,
        ...serializeError(error)
      };
      statusCode = 503;
    }

    try {
      const stripe = getStripe();
      const balance = await withRetries(
        "ops-readiness-stripe",
        () => stripe.balance.retrieve(),
        {
          retries: 3,
          delayMs: 300,
          shouldRetry: isTransientRemoteError,
          context
        }
      );

      checks.stripe = {
        ok: true,
        livemode: balance.livemode,
        availableBuckets: balance.available.length
      };
    } catch (error) {
      checks.stripe = {
        ok: false,
        ...serializeError(error)
      };
      statusCode = 503;
    }
  }

  const payload = {
    status: statusCode === 200 ? "ready" : "not_ready",
    requestId: context.requestId,
    appUrl: env.appUrl,
    now: new Date().toISOString(),
    responseTimeMs: getDurationMs(context),
    checks
  };

  logOpsEvent(statusCode === 200 ? "info" : "warn", "ops-readiness-result", {
    requestId: context.requestId,
    status: payload.status,
    responseTimeMs: payload.responseTimeMs
  });

  return NextResponse.json(payload, {
    status: statusCode
  });
}
