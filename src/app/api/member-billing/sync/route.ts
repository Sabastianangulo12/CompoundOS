import { NextRequest, NextResponse } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { syncMemberBillingLifecycle } from "@/lib/member-billing";
import {
  getDurationMs,
  logOpsEvent,
} from "@/lib/observability";

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-sync");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { admin, member } = auth.data;
    const result = await syncMemberBillingLifecycle(admin, member);

    logOpsEvent("info", "member-billing-sync-finished", {
      requestId: context.requestId,
      memberId: member.id,
      gymId: member.gym_id,
      canceled: result.canceled,
      remindersCreated: result.remindersCreated,
      durationMs: getDurationMs(context)
    });

    return successJson(context, {
      canceled: result.canceled,
      remindersCreated: result.remindersCreated
    });
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Billing sync failed.",
      400,
      error
    );
  }
}
