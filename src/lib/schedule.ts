import type { Database } from "@/types/database";

export type ScheduleProgramRecord =
  Database["public"]["Tables"]["schedule_programs"]["Row"];

export type ScheduleSessionRecord =
  Database["public"]["Tables"]["schedule_sessions"]["Row"];

export type ScheduleBookingRecord =
  Database["public"]["Tables"]["schedule_bookings"]["Row"];

export type ScheduleBookingMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
} | null;

export type ScheduleBookingWithMember = ScheduleBookingRecord & {
  members: ScheduleBookingMember | ScheduleBookingMember[] | null;
};

export type ScheduleSessionWithRelations = ScheduleSessionRecord & {
  schedule_programs: ScheduleProgramRecord | ScheduleProgramRecord[] | null;
  schedule_bookings: ScheduleBookingWithMember[] | null;
};

export const scheduleVisibilityLabels: Record<
  ScheduleSessionRecord["visibility"],
  string
> = {
  member_portal: "Member portal",
  website: "Website",
  public: "Public",
  staff_only: "Staff only"
};

export const scheduleBookingStatusLabels: Record<
  ScheduleBookingRecord["status"],
  string
> = {
  booked: "Booked",
  waitlisted: "Waitlisted",
  canceled: "Canceled",
  checked_in: "Checked in",
  no_show: "No-show"
};

export function getScheduleBookingCounts(bookings: ScheduleBookingWithMember[]) {
  return bookings.reduce(
    (counts, booking) => {
      if (booking.status === "booked") {
        counts.booked += 1;
      }

      if (booking.status === "checked_in") {
        counts.booked += 1;
        counts.checkedIn += 1;
      }

      if (booking.status === "waitlisted") {
        counts.waitlisted += 1;
      }

      if (booking.status === "no_show") {
        counts.noShow += 1;
      }

      return counts;
    },
    {
      booked: 0,
      checkedIn: 0,
      waitlisted: 0,
      noShow: 0
    }
  );
}

export function formatScheduleDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone
  }).format(new Date(value));
}

export function formatScheduleTime(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

export function formatScheduleTimeRange(
  session: Pick<ScheduleSessionRecord, "starts_at" | "ends_at" | "timezone">
) {
  return `${formatScheduleTime(session.starts_at, session.timezone)} - ${formatScheduleTime(
    session.ends_at,
    session.timezone
  )}`;
}

export function formatScheduleCapacity(
  session: Pick<ScheduleSessionRecord, "capacity">,
  bookedCount: number
) {
  if (!session.capacity) {
    return `${bookedCount} booked / unlimited`;
  }

  const remaining = Math.max(session.capacity - bookedCount, 0);
  return `${bookedCount}/${session.capacity} booked, ${remaining} open`;
}

export function normalizeScheduleText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function parseOptionalPositiveInteger(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function parseDollarAmountToCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return 0;
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function parseDateTimeLocalToIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function toDateTimeLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
