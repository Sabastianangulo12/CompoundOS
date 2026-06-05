import { NextRequest, NextResponse } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { getMemberBillingSummary } from "@/lib/member-billing";

export async function GET(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-summary");
  const auth = await requireAuthenticatedMember(context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { admin, member } = auth.data;
    const summary = await getMemberBillingSummary(admin, member);
    return successJson(context, summary);
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Billing summary failed.",
      400,
      error
    );
  }
}
