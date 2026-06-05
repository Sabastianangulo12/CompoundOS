"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  normalizeScheduleText,
  parseDateTimeLocalToIso,
  parseDollarAmountToCents,
  parseOptionalPositiveInteger
} from "@/lib/schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type BookingStatus = Database["public"]["Tables"]["schedule_bookings"]["Row"]["status"];

function scheduleMessage(message: string) {
  return `/dashboard/schedule?message=${encodeURIComponent(message)}`;
}

async function requireGymContext() {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  return {
    supabase,
    currentGym: currentGym.data
  };
}

export async function createScheduleProgramAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const name = normalizeScheduleText(formData.get("name"));
  const description = normalizeScheduleText(formData.get("description"));
  const color = normalizeScheduleText(formData.get("color")) ?? "#f5c542";

  if (!name) {
    redirect(scheduleMessage("Program name is required."));
  }

  const { error } = await supabase.from("schedule_programs").insert({
    gym_id: currentGym.membership.gymId,
    name,
    description,
    color
  });

  if (error) {
    redirect(scheduleMessage(error.message));
  }

  revalidatePath("/dashboard/schedule");
  redirect(scheduleMessage("Program created."));
}

export async function createScheduleSessionAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const title = normalizeScheduleText(formData.get("title"));
  const description = normalizeScheduleText(formData.get("description"));
  const instructorName = normalizeScheduleText(formData.get("instructorName"));
  const location = normalizeScheduleText(formData.get("location"));
  const startsAt = parseDateTimeLocalToIso(formData.get("startsAt"));
  const endsAt = parseDateTimeLocalToIso(formData.get("endsAt"));
  const capacity = parseOptionalPositiveInteger(formData.get("capacity"));
  const costCents = parseDollarAmountToCents(formData.get("costDollars"));
  const programId = normalizeScheduleText(formData.get("programId"));
  const visibility = String(formData.get("visibility") ?? "member_portal");
  const bookingEnabled = formData.get("bookingEnabled") === "on";
  const waitlistEnabled = formData.get("waitlistEnabled") === "on";

  if (!title) {
    redirect(scheduleMessage("Session title is required."));
  }

  if (!startsAt || !endsAt) {
    redirect(scheduleMessage("Session start and end time are required."));
  }

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    redirect(scheduleMessage("Session end time must be after the start time."));
  }

  if (
    !["member_portal", "website", "public", "staff_only"].includes(visibility)
  ) {
    redirect(scheduleMessage("Choose a valid visibility option."));
  }

  const { error } = await supabase.from("schedule_sessions").insert({
    gym_id: currentGym.membership.gymId,
    program_id: programId,
    title,
    description,
    instructor_name: instructorName,
    location,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: currentGym.membership.gymTimezone,
    capacity,
    booking_enabled: bookingEnabled,
    waitlist_enabled: waitlistEnabled,
    visibility: visibility as Database["public"]["Tables"]["schedule_sessions"]["Row"]["visibility"],
    cost_cents: costCents
  });

  if (error) {
    redirect(scheduleMessage(error.message));
  }

  revalidatePath("/dashboard/schedule");
  redirect(scheduleMessage("Session created."));
}

export async function bookMemberIntoSessionAction(formData: FormData) {
  const { supabase } = await requireGymContext();
  const sessionId = normalizeScheduleText(formData.get("sessionId"));
  const memberId = normalizeScheduleText(formData.get("memberId"));

  if (!sessionId || !memberId) {
    redirect(scheduleMessage("Choose both a session and a member."));
  }

  const { error } = await supabase.rpc("create_schedule_booking_for_member", {
    target_session_id: sessionId,
    target_member_id: memberId,
    booking_source: "dashboard"
  });

  if (error) {
    redirect(scheduleMessage(error.message));
  }

  revalidatePath("/dashboard/schedule");
  redirect(scheduleMessage("Member booked into session."));
}

export async function updateScheduleBookingStatusAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const bookingId = normalizeScheduleText(formData.get("bookingId"));
  const nextStatus = normalizeScheduleText(formData.get("status")) as BookingStatus | null;

  if (!bookingId || !nextStatus) {
    redirect(scheduleMessage("Booking and status are required."));
  }

  if (!["booked", "waitlisted", "canceled", "checked_in", "no_show"].includes(nextStatus)) {
    redirect(scheduleMessage("Choose a valid booking status."));
  }

  const bookingResult = await supabase
    .from("schedule_bookings")
    .select("id, gym_id, session_id, member_id, status")
    .eq("id", bookingId)
    .eq("gym_id", currentGym.membership.gymId)
    .maybeSingle();

  if (bookingResult.error || !bookingResult.data) {
    redirect(
      scheduleMessage(bookingResult.error?.message ?? "Booking was not found.")
    );
  }

  const booking = bookingResult.data;

  if (nextStatus === "canceled" && booking.member_id) {
    const { error } = await supabase.rpc("cancel_schedule_booking_for_member", {
      target_booking_id: booking.id,
      target_member_id: booking.member_id
    });

    if (error) {
      redirect(scheduleMessage(error.message));
    }
  } else {
    const updates: Database["public"]["Tables"]["schedule_bookings"]["Update"] = {
      status: nextStatus
    };

    if (nextStatus === "checked_in") {
      updates.checked_in_at = new Date().toISOString();
    }

    if (nextStatus === "canceled") {
      updates.canceled_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("schedule_bookings")
      .update(updates)
      .eq("id", booking.id)
      .eq("gym_id", currentGym.membership.gymId);

    if (error) {
      redirect(scheduleMessage(error.message));
    }
  }

  if (nextStatus === "checked_in" && booking.member_id) {
    const existingCheckIn = await supabase
      .from("check_ins")
      .select("id")
      .eq("gym_id", currentGym.membership.gymId)
      .eq("member_id", booking.member_id)
      .eq("schedule_session_id", booking.session_id)
      .maybeSingle();

    if (!existingCheckIn.data) {
      await supabase.from("check_ins").insert({
        gym_id: currentGym.membership.gymId,
        member_id: booking.member_id,
        schedule_session_id: booking.session_id,
        check_in_method: "manual"
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/check-ins");
  revalidatePath("/dashboard/schedule");
  redirect(scheduleMessage("Booking updated."));
}

export async function cancelScheduleSessionAction(formData: FormData) {
  const { supabase, currentGym } = await requireGymContext();
  const sessionId = normalizeScheduleText(formData.get("sessionId"));
  const cancellationReason = normalizeScheduleText(formData.get("cancellationReason"));

  if (!sessionId) {
    redirect(scheduleMessage("Session is required."));
  }

  const { error } = await supabase
    .from("schedule_sessions")
    .update({
      status: "canceled",
      cancellation_reason: cancellationReason ?? "Canceled by staff"
    })
    .eq("id", sessionId)
    .eq("gym_id", currentGym.membership.gymId);

  if (error) {
    redirect(scheduleMessage(error.message));
  }

  revalidatePath("/dashboard/schedule");
  redirect(scheduleMessage("Session canceled."));
}
