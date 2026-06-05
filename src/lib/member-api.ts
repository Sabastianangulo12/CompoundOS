import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMemberFromToken } from "@/lib/member-auth";
import {
  assertTrustedBrowserOrigin,
  extractBearerToken,
  jsonNoStore
} from "@/lib/http-security";
import {
  createOpsRequestContext,
  getDurationMs,
  logOpsEvent,
  serializeError,
  type OpsRequestContext
} from "@/lib/observability";

type MemberRouteSuccess<T> = {
  ok: true;
  data: T;
};

type MemberRouteFailure = {
  ok: false;
  response: NextResponse;
};

type MemberRouteContext = OpsRequestContext & {
  request: NextRequest;
};

export function createMemberRouteContext(request: NextRequest, operation: string) {
  return {
    request,
    ...createOpsRequestContext(operation)
  } satisfies MemberRouteContext;
}

export async function requireAuthenticatedMember(
  context: MemberRouteContext,
  options?: {
    enforceTrustedOrigin?: boolean;
  }
): Promise<
  | MemberRouteSuccess<
      Awaited<ReturnType<typeof getAuthenticatedMemberFromToken>> & {
        requestId: string;
      }
    >
  | MemberRouteFailure
> {
  const token = extractBearerToken(context.request);

  if (!token) {
    logOpsEvent("warn", `${context.operation}-missing-token`, {
      requestId: context.requestId
    });
    return {
      ok: false,
      response: jsonNoStore(
        {
          error: "Missing authorization token.",
          requestId: context.requestId
        },
        { status: 401 }
      )
    };
  }

  try {
    if (options?.enforceTrustedOrigin) {
      assertTrustedBrowserOrigin(context.request);
    }

    const auth = await getAuthenticatedMemberFromToken(token);

    return {
      ok: true,
      data: {
        ...auth,
        requestId: context.requestId
      }
    };
  } catch (error) {
    logOpsEvent("warn", `${context.operation}-auth-failed`, {
      requestId: context.requestId,
      durationMs: getDurationMs(context),
      ...serializeError(error)
    });

    return {
      ok: false,
      response: jsonNoStore(
        {
          error: error instanceof Error ? error.message : "Unauthorized.",
          requestId: context.requestId
        },
        { status: 401 }
      )
    };
  }
}

export function successJson<T>(
  context: OpsRequestContext,
  body: T,
  init?: ResponseInit
) {
  const response = jsonNoStore(body, init);
  response.headers.set("x-request-id", context.requestId);
  return response;
}

export function failureJson(
  context: OpsRequestContext,
  message: string,
  status: number,
  error?: unknown
) {
  if (error) {
    logOpsEvent(status >= 500 ? "error" : "warn", `${context.operation}-failed`, {
      requestId: context.requestId,
      durationMs: getDurationMs(context),
      ...serializeError(error)
    });
  }

  const response = jsonNoStore(
    {
      error: message,
      requestId: context.requestId
    },
    { status }
  );
  response.headers.set("x-request-id", context.requestId);
  return response;
}
