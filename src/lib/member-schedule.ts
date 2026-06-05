import {
  formatScheduleCapacity,
  formatScheduleDate,
  formatScheduleTimeRange,
  getScheduleBookingCounts,
  type ScheduleSessionWithRelations
} from "@/lib/schedule";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type AuthenticatedMember = Database["public"]["Tables"]["members"]["Row"];

export type MemberScheduleSession = {
  id: string;
  title: string;
  description: string | null;
  instructorName: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  capacityLabel: string;
  spotsRemaining: number | null;
  bookingEnabled: boolean;
  waitlistEnabled: boolean;
  costCents: number;
  program: {
    id: string;
    name: string;
    color: string;
  } | null;
  counts: {
    booked: number;
    checkedIn: number;
    waitlisted: number;
    noShow: number;
  };
  memberBooking: {
    id: string;
    status: Database["public"]["Tables"]["schedule_bookings"]["Row"]["status"];
  } | null;
};

export async function getMemberScheduleSessions(
  admin: AppSupabaseClient,
  member: AuthenticatedMember
) {
  const { data, error } = await admin
    .from("schedule_sessions")
    .select(
      `
        *,
        schedule_programs (
          id,
          gym_id,
          name,
          description,
          color,
          is_active,
          sort_order,
          created_at,
          updated_at
        ),
        schedule_bookings (
          id,
          gym_id,
          session_id,
          member_id,
          guest_name,
          guest_email,
          guest_phone,
          status,
          source,
          notes,
          booked_at,
          canceled_at,
          checked_in_at,
          created_at,
          updated_at
        )
      `
    )
    .eq("gym_id", member.gym_id)
    .eq("status", "active")
    .in("visibility", ["member_portal", "public"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(80);

  if (error) {
    return {
      data: null,
      error
    };
  }

  const sessions = ((data ?? []) as ScheduleSessionWithRelations[]).map(
    (session) => {
      const bookings = session.schedule_bookings ?? [];
      const counts = getScheduleBookingCounts(bookings);
      const memberBooking =
        bookings.find(
          (booking) =>
            booking.member_id === member.id &&
            ["booked", "waitlisted", "checked_in"].includes(booking.status)
        ) ?? null;
      const program = Array.isArray(session.schedule_programs)
        ? session.schedule_programs[0] ?? null
        : session.schedule_programs;
      const spotsRemaining = session.capacity
        ? Math.max(session.capacity - counts.booked, 0)
        : null;

      return {
        id: session.id,
        title: session.title,
        description: session.description,
        instructorName: session.instructor_name,
        location: session.location,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        dateLabel: formatScheduleDate(session.starts_at, session.timezone),
        timeLabel: formatScheduleTimeRange(session),
        capacityLabel: formatScheduleCapacity(session, counts.booked),
        spotsRemaining,
        bookingEnabled: session.booking_enabled,
        waitlistEnabled: session.waitlist_enabled,
        costCents: session.cost_cents,
        program: program
          ? {
              id: program.id,
              name: program.name,
              color: program.color
            }
          : null,
        counts,
        memberBooking: memberBooking
          ? {
              id: memberBooking.id,
              status: memberBooking.status
            }
          : null
      } satisfies MemberScheduleSession;
    }
  );

  return {
    data: sessions,
    error: null
  };
}

export async function bookMemberScheduleSession(input: {
  admin: AppSupabaseClient;
  member: AuthenticatedMember;
  sessionId: string;
}) {
  const { data, error } = await input.admin.rpc(
    "create_schedule_booking_for_member",
    {
      target_session_id: input.sessionId,
      target_member_id: input.member.id,
      booking_source: "member_app"
    }
  );

  return {
    data,
    error
  };
}

export async function cancelMemberScheduleBooking(input: {
  admin: AppSupabaseClient;
  member: AuthenticatedMember;
  bookingId: string;
}) {
  const { data, error } = await input.admin.rpc(
    "cancel_schedule_booking_for_member",
    {
      target_booking_id: input.bookingId,
      target_member_id: input.member.id
    }
  );

  return {
    data,
    error
  };
}
