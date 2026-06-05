import { NextRequest, NextResponse } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { parsePositiveInteger } from "@/lib/http-security";
import { freezeMemberMembership } from "@/lib/member-billing";

type FreezeBody = {
  weeks?: number;
};

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-freeze");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as FreezeBody | null;
    const weeks = parsePositiveInteger(body?.weeks ?? 4, 4);

    if (weeks > 4) {
      throw new Error("Freeze duration cannot exceed 4 weeks.");
    }
    const { admin, member } = auth.data;
    const frozenUntil = await freezeMemberMembership(admin, member, weeks);
    return successJson(context, { frozenUntil });
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Freeze request failed.",
      400,
      error
    );
  }
}
