import { NextRequest } from "next/server";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { cancelMemberScheduleBooking } from "@/lib/member-schedule";

type CancelRequestBody = {
  bookingId?: string;
};

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-schedule-cancel");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as CancelRequestBody | null;
  const bookingId = body?.bookingId?.trim();

  if (!bookingId) {
    return failureJson(context, "Booking is required.", 400);
  }

  const { data, error } = await cancelMemberScheduleBooking({
    admin: auth.data.admin,
    member: auth.data.member,
    bookingId
  });

  if (error) {
    return failureJson(context, error.message, 400, error);
  }

  return successJson(context, {
    booking: data
  });
}
