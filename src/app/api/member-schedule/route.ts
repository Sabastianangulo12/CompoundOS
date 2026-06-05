import { NextRequest } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { getMemberScheduleSessions } from "@/lib/member-schedule";

export async function GET(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-schedule-list");
  const auth = await requireAuthenticatedMember(context);

  if (!auth.ok) {
    return auth.response;
  }

  const { data, error } = await getMemberScheduleSessions(
    auth.data.admin,
    auth.data.member
  );

  if (error) {
    return failureJson(context, error.message, 400, error);
  }

  return successJson(context, {
    sessions: data ?? []
  });
}
