import { NextRequest } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { bookMemberScheduleSession } from "@/lib/member-schedule";

type BookRequestBody = {
  sessionId?: string;
};

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-schedule-book");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as BookRequestBody | null;
  const sessionId = body?.sessionId?.trim();

  if (!sessionId) {
    return failureJson(context, "Session is required.", 400);
  }

  const { data, error } = await bookMemberScheduleSession({
    admin: auth.data.admin,
    member: auth.data.member,
    sessionId
  });

  if (error) {
    return failureJson(context, error.message, 400, error);
  }

  return successJson(context, {
    booking: data
  });
}
