import { NextRequest, NextResponse } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { cancelMemberMembership } from "@/lib/member-billing";

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-cancel");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { admin, member } = auth.data;
    const canceledAt = await cancelMemberMembership(admin, member);
    return successJson(context, { canceledAt });
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Cancellation failed.",
      400,
      error
    );
  }
}
