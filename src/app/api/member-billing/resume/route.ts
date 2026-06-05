import { NextRequest, NextResponse } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { resumeMemberMembership } from "@/lib/member-billing";

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-resume");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { admin, member } = auth.data;
    const result = await resumeMemberMembership(admin, member);
    return successJson(context, result);
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Renewal failed.",
      400,
      error
    );
  }
}
