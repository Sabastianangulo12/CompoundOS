import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  bookMemberIntoSessionAction,
  cancelScheduleSessionAction,
  createScheduleProgramAction,
  createScheduleSessionAction,
  updateScheduleBookingStatusAction
} from "@/app/(dashboard)/dashboard/schedule/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  formatScheduleCapacity,
  formatScheduleDate,
  formatScheduleTimeRange,
  scheduleBookingStatusLabels,
  scheduleVisibilityLabels,
  toDateTimeLocalInputValue,
  type ScheduleBookingWithMember,
  type ScheduleProgramRecord,
  type ScheduleSessionWithRelations
} from "@/lib/schedule";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SchedulePageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

type ScheduleRosterMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
};

type ScheduleBookingCountRow = Pick<ScheduleBookingWithMember, "session_id" | "status">;

type ScheduleBookingCounts = {
  booked: number;
  checkedIn: number;
  waitlisted: number;
  noShow: number;
};

function getMemberName(member: ScheduleRosterMember | null | undefined) {
  if (!member) {
    return "Unknown member";
  }

  return `${member.first_name} ${member.last_name}`;
}

function getBookingMember(booking: ScheduleBookingWithMember) {
  return toOneRelation(booking.members);
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const now = new Date();
  const defaultStartsAt = new Date(now.getTime() + 60 * 60 * 1000);
  defaultStartsAt.setMinutes(0, 0, 0);
  const defaultEndsAt = new Date(defaultStartsAt.getTime() + 60 * 60 * 1000);

  const [programsResult, sessionsResult, membersResult] = await Promise.all([
    supabase
      .from("schedule_programs")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
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
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .gte("starts_at", new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(12),
    supabase
      .from("members")
      .select("id, first_name, last_name, email, status")
      .eq("gym_id", currentGym.data.membership.gymId)
      .in("status", ["active", "lead"])
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true })
      .limit(80)
  ]);

  if (programsResult.error) {
    throw new Error(programsResult.error.message);
  }

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  const programs = (programsResult.data ?? []) as ScheduleProgramRecord[];
  const activePrograms = programs.filter((program) => program.is_active);
  const rawSessions = (sessionsResult.data ?? []) as Omit<
    ScheduleSessionWithRelations,
    "schedule_bookings"
  >[];
  const sessionIds = rawSessions.map((session) => session.id);
  const [bookingCountsResult, bookingPreviewResult] =
    sessionIds.length > 0
      ? await Promise.all([
          supabase
            .from("schedule_bookings")
            .select("session_id, status")
            .eq("gym_id", currentGym.data.membership.gymId)
            .in("session_id", sessionIds)
            .in("status", ["booked", "waitlisted", "checked_in", "no_show"]),
          supabase
            .from("schedule_bookings")
            .select(
              `
                *,
                members (
                  id,
                  first_name,
                  last_name,
                  email,
                  status
                )
              `
            )
            .eq("gym_id", currentGym.data.membership.gymId)
            .in("session_id", sessionIds)
            .in("status", ["booked", "waitlisted", "checked_in", "no_show"])
            .order("created_at", { ascending: true })
            .limit(36)
        ])
      : [
          { data: [], error: null },
          { data: [], error: null }
        ];

  if (bookingCountsResult.error) {
    throw new Error(bookingCountsResult.error.message);
  }

  if (bookingPreviewResult.error) {
    throw new Error(bookingPreviewResult.error.message);
  }

  const bookingCountsBySession = new Map<string, ScheduleBookingCounts>();
  for (const booking of (bookingCountsResult.data ?? []) as ScheduleBookingCountRow[]) {
    const counts =
      bookingCountsBySession.get(booking.session_id) ??
      {
        booked: 0,
        checkedIn: 0,
        waitlisted: 0,
        noShow: 0
      };

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

    bookingCountsBySession.set(booking.session_id, counts);
  }

  const previewBookingsBySession = new Map<string, ScheduleBookingWithMember[]>();
  for (const booking of (bookingPreviewResult.data ?? []) as ScheduleBookingWithMember[]) {
    previewBookingsBySession.set(booking.session_id, [
      ...(previewBookingsBySession.get(booking.session_id) ?? []),
      booking
    ]);
  }

  const getCountsForSession = (sessionId: string) =>
    bookingCountsBySession.get(sessionId) ??
    {
      booked: 0,
      checkedIn: 0,
      waitlisted: 0,
      noShow: 0
    };
  const sessions = rawSessions.map((session) => ({
    ...session,
    schedule_bookings: previewBookingsBySession.get(session.id) ?? []
  })) as ScheduleSessionWithRelations[];
  const bookableSessions = sessions.filter(
    (session) =>
      session.status === "active" &&
      session.booking_enabled &&
      new Date(session.starts_at).getTime() > now.getTime()
  );
  const members = (membersResult.data ?? []) as ScheduleRosterMember[];
  const metrics = sessions.reduce(
    (summary, session) => {
      const counts = getCountsForSession(session.id);

      summary.totalSessions += 1;
      summary.booked += counts.booked;
      summary.waitlisted += counts.waitlisted;

      if (session.booking_enabled) {
        summary.bookableSessions += 1;
      }

      if (session.status === "canceled") {
        summary.canceled += 1;
      }

      return summary;
    },
    {
      totalSessions: 0,
      bookableSessions: 0,
      booked: 0,
      waitlisted: 0,
      canceled: 0
    }
  );

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Gym schedule"
        title="Classes, bookings, capacity, and waitlists"
        description="Run the daily training calendar from the owner dashboard: create programs, publish bookable sessions, place members into classes, and track attendance from one operational surface."
      />

      {resolvedSearchParams?.message ? (
        <div className="panel border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Upcoming sessions" value={metrics.totalSessions} />
        <MetricCard label="Bookable" value={metrics.bookableSessions} />
        <MetricCard label="Booked seats" value={metrics.booked} />
        <MetricCard label="Waitlist" value={metrics.waitlisted} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.4fr]">
        <div className="space-y-6">
          <form action={createScheduleProgramAction} className="panel p-5">
            <p className="section-kicker">Programs</p>
            <h2 className="mt-2 text-xl font-semibold">Create a training track</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Programs group sessions by discipline or service line: Strength,
              HIIT, Youth, Private Training, Seminars, and more.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium">
                Program name
                <input
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="name"
                  placeholder="Strength Fundamentals"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Color
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="color"
                  type="color"
                  defaultValue="#f5c542"
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="description"
                  placeholder="Who this track is for and what members can expect."
                />
              </label>
            </div>
            <ServerActionButton
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black"
              idleLabel="Create program"
              pendingLabel="Creating..."
            />
          </form>

          <form action={createScheduleSessionAction} className="panel p-5">
            <p className="section-kicker">Session builder</p>
            <h2 className="mt-2 text-xl font-semibold">Publish a class or event</h2>
            <div className="mt-5 grid gap-3">
              <label className="block text-sm font-medium">
                Title
                <input
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="title"
                  placeholder="6 AM Strength"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Program
                <select
                  className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="programId"
                >
                  <option value="">No program</option>
                  {activePrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Starts
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={toDateTimeLocalInputValue(defaultStartsAt)}
                    required
                  />
                </label>
                <label className="block text-sm font-medium">
                  Ends
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={toDateTimeLocalInputValue(defaultEndsAt)}
                    required
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Instructor
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="instructorName"
                    placeholder="Coach name"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Location
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="location"
                    placeholder="Main floor"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                  Capacity
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min={1}
                    name="capacity"
                    placeholder="24"
                    type="number"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Drop-in fee
                  <input
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    min={0}
                    name="costDollars"
                    placeholder="0"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Visibility
                  <select
                    className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    name="visibility"
                    defaultValue="member_portal"
                  >
                    <option value="member_portal">Member portal</option>
                    <option value="website">Website</option>
                    <option value="public">Public</option>
                    <option value="staff_only">Staff only</option>
                  </select>
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-black/30 p-3 text-sm">
                <input className="mt-1" name="bookingEnabled" type="checkbox" defaultChecked />
                <span>
                  <span className="block font-medium">Allow booking</span>
                  <span className="text-muted">
                    Members can reserve a spot from the member app or staff can book them here.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-black/30 p-3 text-sm">
                <input className="mt-1" name="waitlistEnabled" type="checkbox" defaultChecked />
                <span>
                  <span className="block font-medium">Enable waitlist</span>
                  <span className="text-muted">
                    Full classes keep collecting demand and auto-promote the next member after cancellation.
                  </span>
                </span>
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  name="description"
                  placeholder="Class notes, skill focus, or prep instructions."
                />
              </label>
            </div>
            <ServerActionButton
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black"
              idleLabel="Publish session"
              pendingLabel="Publishing..."
            />
          </form>

          <form action={bookMemberIntoSessionAction} className="panel p-5">
            <p className="section-kicker">Quick booking</p>
            <h2 className="mt-2 text-xl font-semibold">Place a member into class</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              One fast staff workflow for booking members without duplicating huge
              member dropdowns inside every session card.
            </p>
            <label className="mt-5 block text-sm font-medium">
              Session
              <select
                className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                name="sessionId"
                required
              >
                <option value="">Choose session</option>
                {bookableSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} - {formatScheduleDate(session.starts_at, session.timezone)}{" "}
                    {formatScheduleTimeRange(session)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium">
              Member
              <select
                className="mt-2 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                name="memberId"
                required
              >
                <option value="">Choose member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberName(member)} - {member.status}
                  </option>
                ))}
              </select>
            </label>
            <ServerActionButton
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black"
              disabled={bookableSessions.length === 0 || members.length === 0}
              idleLabel="Book member"
              pendingLabel="Booking..."
            />
          </form>
        </div>

        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="panel p-6">
              <p className="section-kicker">No sessions yet</p>
              <h2 className="mt-2 text-2xl font-semibold">Build the operating calendar.</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Start by adding a program and publishing the first bookable class. Once
                sessions exist, this page becomes the owner’s class roster, capacity,
                waitlist, and attendance command center.
              </p>
            </div>
          ) : (
            sessions.map((session) => {
              const program = toOneRelation(session.schedule_programs);
              const bookings = session.schedule_bookings ?? [];
              const counts = getCountsForSession(session.id);
              const activeBookings = bookings.filter((booking) =>
                ["booked", "waitlisted", "checked_in", "no_show"].includes(
                  booking.status
                )
              );
              const visibleBookings = activeBookings.slice(0, 3);
              const totalActiveBookings = counts.booked + counts.waitlisted + counts.noShow;

              return (
                <article
                  className={[
                    "panel overflow-hidden",
                    session.status === "canceled" ? "opacity-70" : ""
                  ].join(" ")}
                  key={session.id}
                >
                  <div className="border-b border-border p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {program ? (
                            <span
                              className="rounded-full border border-border px-3 py-1 text-xs font-medium"
                              style={{
                                borderColor: program.color,
                                color: program.color
                              }}
                            >
                              {program.name}
                            </span>
                          ) : null}
                          <span className="status-pill">
                            {scheduleVisibilityLabels[session.visibility]}
                          </span>
                          {session.status === "canceled" ? (
                            <span className="status-pill border-red-500/40 text-red-200">
                              Canceled
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-3 text-2xl font-semibold">{session.title}</h2>
                        <p className="mt-2 text-sm text-muted">
                          {formatScheduleDate(session.starts_at, session.timezone)} at{" "}
                          {formatScheduleTimeRange(session)}
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          {[
                            session.instructor_name ? `Coach: ${session.instructor_name}` : null,
                            session.location ? `Location: ${session.location}` : null,
                            session.cost_cents > 0
                              ? `Drop-in: $${(session.cost_cents / 100).toFixed(2)}`
                              : null
                          ]
                            .filter(Boolean)
                            .join(" - ") || "No instructor, location, or fee set."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-black/25 px-4 py-3 text-sm">
                        <p className="font-semibold text-foreground">
                          {formatScheduleCapacity(session, counts.booked)}
                        </p>
                        <p className="mt-1 text-muted">
                          {counts.checkedIn} checked in - {counts.waitlisted} waitlisted
                        </p>
                      </div>
                    </div>
                    {session.description ? (
                      <p className="mt-4 rounded-2xl border border-border bg-black/20 p-3 text-sm leading-6 text-muted">
                        {session.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.72fr]">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">Roster</h3>
                        <span className="text-xs uppercase tracking-[0.2em] text-muted">
                          {totalActiveBookings} records
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {totalActiveBookings === 0 ? (
                          <p className="rounded-xl border border-border bg-black/20 p-3 text-sm text-muted">
                            No bookings yet. Add a member or let members reserve from the app.
                          </p>
                        ) : (
                          visibleBookings.map((booking) => {
                            const member = getBookingMember(booking);

                            return (
                              <div
                                className="rounded-xl border border-border bg-black/20 p-3"
                                key={booking.id}
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <p className="font-medium">
                                      {member
                                        ? getMemberName(member)
                                        : booking.guest_name ?? "Guest"}
                                    </p>
                                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                                      {scheduleBookingStatusLabels[booking.status]} -{" "}
                                      {booking.source.replace("_", " ")}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {booking.status !== "checked_in" ? (
                                      <form action={updateScheduleBookingStatusAction}>
                                        <input
                                          name="bookingId"
                                          type="hidden"
                                          value={booking.id}
                                        />
                                        <input
                                          name="status"
                                          type="hidden"
                                          value="checked_in"
                                        />
                                        <ServerActionButton
                                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent"
                                          idleLabel="Check in"
                                          pendingLabel="Checking..."
                                        />
                                      </form>
                                    ) : null}
                                    {booking.status !== "no_show" ? (
                                      <form action={updateScheduleBookingStatusAction}>
                                        <input
                                          name="bookingId"
                                          type="hidden"
                                          value={booking.id}
                                        />
                                        <input name="status" type="hidden" value="no_show" />
                                        <ServerActionButton
                                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent"
                                          idleLabel="No-show"
                                          pendingLabel="Saving..."
                                        />
                                      </form>
                                    ) : null}
                                    {booking.status !== "canceled" ? (
                                      <form action={updateScheduleBookingStatusAction}>
                                        <input
                                          name="bookingId"
                                          type="hidden"
                                          value={booking.id}
                                        />
                                        <input name="status" type="hidden" value="canceled" />
                                        <ServerActionButton
                                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-100 hover:border-red-300"
                                          idleLabel="Cancel"
                                          pendingLabel="Canceling..."
                                        />
                                      </form>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        {totalActiveBookings > visibleBookings.length ? (
                          <p className="rounded-xl border border-border bg-black/20 p-3 text-sm text-muted">
                            Showing {visibleBookings.length} of {totalActiveBookings} roster
                            records to keep the schedule fast. Use check-ins for the full
                            operational scan flow.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border bg-black/20 p-4">
                        <h3 className="font-semibold">Staff booking</h3>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          Use the quick-booking panel to add members without bloating
                          every session card with a full roster dropdown.
                        </p>
                      </div>

                      <form
                        action={cancelScheduleSessionAction}
                        className="rounded-2xl border border-border bg-black/20 p-4"
                      >
                        <input name="sessionId" type="hidden" value={session.id} />
                        <h3 className="font-semibold">Session controls</h3>
                        <input
                          className="mt-3 w-full rounded-xl border border-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-accent"
                          name="cancellationReason"
                          placeholder="Cancellation reason"
                        />
                        <ServerActionButton
                          className="mt-3 w-full rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-100 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={session.status === "canceled"}
                          idleLabel="Cancel session"
                          pendingLabel="Canceling..."
                        />
                      </form>

                      <Link
                        className="action-link justify-center"
                        href="/dashboard/check-ins"
                        prefetch
                      >
                        Open check-ins
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
