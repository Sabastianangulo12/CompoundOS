import { notFound, redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { MemberForm } from "@/components/members/member-form";
import { sendMemberNotificationAction } from "@/app/(dashboard)/dashboard/notifications/actions";
import {
  createSubscriptionAction,
  startStripeCheckoutAction
} from "@/app/(dashboard)/dashboard/revenue/actions";
import {
  addMemberNoteAction,
  archiveMemberAction,
  archiveMemberNoteAction,
  cancelMemberMembershipAction,
  completeMemberFollowUpTaskAction,
  createMemberFollowUpTaskAction,
  freezeMemberMembershipAction,
  resumeMemberMembershipAction,
  startMemberCardSetupAction,
  updateMemberAction
} from "@/app/(dashboard)/dashboard/members/actions";
import { getRecentCheckInsForGym } from "@/lib/check-ins";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getMemberByIdForGym } from "@/lib/members";
import { formatCurrencyFromCents } from "@/lib/revenue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecentWorkoutsForMember } from "@/lib/workouts";

type EditMemberPageProps = {
  params: Promise<{
    memberId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function EditMemberPage({
  params,
  searchParams
}: EditMemberPageProps) {
  const { memberId } = await params;
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

  const { data: member, error } = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (error) {
    redirect(`/dashboard/members?message=${encodeURIComponent(error.message)}`);
  }

  if (!member) {
    notFound();
  }

  const [recentCheckInsResult, subscriptionsResult, workoutsResult, paymentsResult, membershipEventsResult, notificationsResult, notesResult, followUpTasksResult, membershipPlansResult, gymBillingResult] = await Promise.all([
    getRecentCheckInsForGym(supabase, currentGym.data.membership.gymId, 100),
    supabase
      .from("subscriptions")
      .select(
        `
          *,
          membership_plans (
            id,
            name,
            price_cents,
            billing_interval
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("member_id", member.id)
      .order("created_at", {
        ascending: false
      }),
    getRecentWorkoutsForMember(
      supabase,
      currentGym.data.membership.gymId,
      member.id,
      5
    ),
    supabase
      .from("payments")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("member_id", member.id)
      .order("created_at", {
        ascending: false
      })
      .limit(10),
    supabase
      .from("member_membership_events")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("member_id", member.id)
      .order("created_at", {
        ascending: false
      })
      .limit(10),
      supabase
        .from("notifications")
        .select("id, title, body, type, status, created_at, read_at")
        .eq("gym_id", currentGym.data.membership.gymId)
        .eq("member_id", member.id)
      .order("created_at", {
        ascending: false
      })
      .limit(10),
    supabase
      .from("member_notes")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("member_id", member.id)
      .eq("is_archived", false)
      .order("created_at", {
        ascending: false
      })
      .limit(10),
    supabase
      .from("member_follow_up_tasks")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("member_id", member.id)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("membership_plans")
      .select("id, name, price_cents, billing_interval")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("is_active", true)
      .order("price_cents", { ascending: true }),
    supabase
      .from("gyms")
      .select("stripe_onboarding_completed, stripe_charges_enabled")
      .eq("id", currentGym.data.membership.gymId)
      .single()
  ]);

  if (recentCheckInsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(
        recentCheckInsResult.error.message
      )}`
    );
  }

  if (subscriptionsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(
        subscriptionsResult.error.message
      )}`
    );
  }

  if (workoutsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(workoutsResult.error.message)}`
    );
  }

  if (paymentsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(paymentsResult.error.message)}`
    );
  }

  if (membershipEventsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(membershipEventsResult.error.message)}`
    );
  }

  if (notificationsResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(notificationsResult.error.message)}`
    );
  }

  if (notesResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(notesResult.error.message)}`
    );
  }

  if (followUpTasksResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(followUpTasksResult.error.message)}`
    );
  }

  if (membershipPlansResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(membershipPlansResult.error.message)}`
    );
  }

  if (gymBillingResult.error) {
    redirect(
      `/dashboard/members?message=${encodeURIComponent(gymBillingResult.error.message)}`
    );
  }

  const memberCheckIns = recentCheckInsResult.data.filter(
    (checkIn) => checkIn.member_id === member.id
  );
  const memberSubscriptions = subscriptionsResult.data ?? [];
  const memberWorkouts = workoutsResult.data ?? [];
  const memberPayments = paymentsResult.data ?? [];
  const memberLifecycleEvents = membershipEventsResult.data ?? [];
  const memberNotifications = notificationsResult.data ?? [];
  const memberNotes = notesResult.data ?? [];
  const memberFollowUpTasks = followUpTasksResult.data ?? [];
  const membershipPlans = membershipPlansResult.data ?? [];
  const gymBilling = gymBillingResult.data;
  const memberEditPath = `/dashboard/members/${member.id}/edit`;
  const lastCheckIn = memberCheckIns[0] ?? null;
  const activeSubscription = memberSubscriptions.find((subscription) =>
    ["active", "trialing", "past_due"].includes(subscription.status)
  );
  const daysSinceLastCheckIn = lastCheckIn
    ? Math.floor(
        (Date.now() - new Date(lastCheckIn.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
      : null;
  const stripeBillingReady = Boolean(
    gymBilling?.stripe_onboarding_completed && gymBilling?.stripe_charges_enabled
  );
  const riskMarkers = [
    member.status === "frozen"
      ? {
          label: "Frozen membership",
          tone: "border-amber-500/30 bg-amber-500/10 text-amber-100"
        }
      : null,
    activeSubscription?.status === "past_due"
      ? {
          label: "Past-due billing",
          tone: "border-rose-500/30 bg-rose-500/10 text-rose-100"
        }
      : null,
    !activeSubscription
      ? {
          label: "No active plan",
          tone: "border-zinc-500/40 bg-white/5 text-zinc-100"
        }
      : null,
    !member.stripe_default_payment_method_id
      ? {
          label: "No card on file",
          tone: "border-zinc-500/40 bg-white/5 text-zinc-100"
        }
      : null,
    daysSinceLastCheckIn !== null && daysSinceLastCheckIn >= 14
      ? {
          label: `No visit in ${daysSinceLastCheckIn} days`,
          tone: "border-orange-500/30 bg-orange-500/10 text-orange-100"
        }
      : null,
    memberFollowUpTasks.some((task) => task.status === "open" && task.priority === "high")
      ? {
          label: "High-priority follow-up open",
          tone: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100"
        }
      : null
  ].filter(Boolean) as Array<{ label: string; tone: string }>;
  const operatorTimeline = [
    ...memberLifecycleEvents.map((event) => ({
      id: `lifecycle-${event.id}`,
      createdAt: event.created_at,
      title:
        event.event_type === "frozen" ? "Membership frozen" : "Membership canceled",
      description:
        event.event_type === "frozen"
          ? `Frozen until ${event.frozen_until ?? "not set"}`
          : event.reason === "freeze_expired"
            ? "Canceled after the freeze window ended."
            : `Reason: ${event.reason ?? "not specified"}`,
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-100"
    })),
    ...memberNotes.map((note) => ({
      id: `note-${note.id}`,
      createdAt: note.created_at,
      title: "Staff note added",
      description: note.body,
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-100"
    })),
    ...memberFollowUpTasks.map((task) => ({
      id: `task-${task.id}`,
      createdAt: task.completed_at ?? task.created_at,
      title:
        task.status === "completed"
          ? `Follow-up completed: ${task.title}`
          : `Follow-up opened: ${task.title}`,
      description: `${task.task_type.replace("_", " ")} | ${task.priority}${task.details ? ` | ${task.details}` : ""}`,
      tone:
        task.status === "completed"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
          : "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100"
    })),
    ...memberPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      createdAt: payment.paid_at ?? payment.created_at,
      title: `Payment ${payment.status}`,
      description: formatCurrencyFromCents(payment.amount_cents),
      tone:
        payment.status === "succeeded"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
          : payment.status === "failed"
            ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
            : "border-zinc-500/40 bg-white/5 text-zinc-100"
    })),
    ...memberNotifications.map((notification) => ({
      id: `notification-${notification.id}`,
      createdAt: notification.created_at,
        title: `Notification sent: ${notification.title}`,
        description: `${notification.type} | ${notification.status} | ${notification.read_at ? "read" : "unread"}`,
        tone: "border-violet-500/30 bg-violet-500/10 text-violet-100"
      })),
    ...memberWorkouts.map((workout) => ({
      id: `workout-${workout.id}`,
      createdAt: workout.performed_at,
      title: `Workout logged: ${workout.title}`,
      description: `${workout.workout_sets.length} set${workout.workout_sets.length === 1 ? "" : "s"}${workout.notes ? ` | ${workout.notes}` : ""}`,
      tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
    })),
    ...memberCheckIns.map((checkIn) => ({
      id: `checkin-${checkIn.id}`,
      createdAt: checkIn.created_at,
      title: "Check-in recorded",
      description: checkIn.check_in_method,
      tone: "border-orange-500/30 bg-orange-500/10 text-orange-100"
    }))
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
    .slice(0, 20);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <DashboardPageHeader
          eyebrow="Members"
          title={`Edit ${member.first_name} ${member.last_name}`}
          description="Update profile details for this gym-scoped member record."
        />
        <form action={archiveMemberAction} className="lg:pt-4">
          <input name="memberId" type="hidden" value={member.id} />
          <input name="redirectTo" type="hidden" value={memberEditPath} />
          <ServerActionButton
            idleLabel="Archive member"
            pendingLabel="Archiving..."
            variant="secondary"
          />
        </form>
      </div>
      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}
      <MemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        pendingLabel="Saving..."
        defaultValues={{
          id: member.id,
          firstName: member.first_name,
          lastName: member.last_name,
          email: member.email,
          phone: member.phone,
          status: member.status,
          joinedAt: member.joined_at,
          dateOfBirth: member.date_of_birth,
          addressLine1: member.address_line_1,
          addressLine2: member.address_line_2,
          city: member.city,
          stateRegion: member.state_region,
          postalCode: member.postal_code,
          emergencyContactName: member.emergency_contact_name,
          emergencyContactPhone: member.emergency_contact_phone,
          emergencyContactRelationship: member.emergency_contact_relationship,
          medicalNotes: member.medical_notes,
          waiverRequired: member.waiver_required,
          waiverTitle: member.waiver_title,
          waiverBody: member.waiver_body,
          waiverSignatureName: member.waiver_signature_name,
          waiverSignedAt: member.waiver_signed_at
            ? new Date(member.waiver_signed_at).toISOString().slice(0, 10)
            : null
        }}
      />
      <section className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Operator snapshot</p>
          <p className="mt-3 text-lg font-semibold capitalize">{member.status}</p>
          <p className="mt-2 text-sm text-muted">
            {activeSubscription?.membership_plans?.name ?? "No active plan assigned"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Check-ins</p>
          <p className="mt-3 text-lg font-semibold">{memberCheckIns.length}</p>
          <p className="mt-2 text-sm text-muted">
            {lastCheckIn
              ? `Last visit ${new Date(lastCheckIn.created_at).toLocaleDateString("en-US")}`
              : "No visits recorded yet"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Payments</p>
          <p className="mt-3 text-lg font-semibold">{memberPayments.length}</p>
          <p className="mt-2 text-sm text-muted">
            {memberPayments[0]
              ? `${formatCurrencyFromCents(memberPayments[0].amount_cents)} most recent`
              : "No payment history yet"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Staff notes</p>
          <p className="mt-3 text-lg font-semibold">{memberNotes.length}</p>
          <p className="mt-2 text-sm text-muted">
            {memberNotes[0]
              ? `Latest note ${new Date(memberNotes[0].created_at).toLocaleDateString("en-US")}`
              : "No open notes on file"}
          </p>
        </div>
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Risk markers</h2>
          <p className="mt-1 text-sm text-muted">
            Fast operator flags for attendance, billing, and retention follow-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 px-6 py-5">
          {riskMarkers.length === 0 ? (
            <p className="text-sm text-muted">No active risk markers right now.</p>
          ) : (
            riskMarkers.map((marker) => (
              <span
                key={marker.label}
                className={`rounded-full border px-3 py-2 text-xs font-medium tracking-[0.18em] uppercase ${marker.tone}`}
              >
                {marker.label}
              </span>
            ))
          )}
        </div>
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Operator timeline</h2>
          <p className="mt-1 text-sm text-muted">
            One stream for the member story across billing, attendance, notes, tasks, notifications, and workouts.
          </p>
        </div>
        {operatorTimeline.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            No operator activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {operatorTimeline.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.title}</p>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${entry.tone}`}
                    >
                      timeline
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{entry.description}</p>
                </div>
                <p className="text-sm text-muted lg:text-right">
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: currentGym.data.membership.gymTimezone
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Membership controls</h2>
          <p className="mt-1 text-sm text-muted">
            Operator actions for lifecycle changes, plan assignment, checkout, and card-on-file setup.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Current status</p>
            <p className="mt-3 text-lg font-semibold capitalize">{member.status}</p>
            <p className="mt-2 text-sm text-muted">
              {member.frozen_until
                ? `Frozen until ${member.frozen_until}`
                : member.canceled_at
                  ? `Canceled on ${new Date(member.canceled_at).toLocaleDateString("en-US")}`
                  : "No freeze or cancel markers on file."}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Freeze window</p>
            <p className="mt-3 text-lg font-semibold">4 weeks</p>
            <p className="mt-2 text-sm text-muted">
              Frozen memberships notify the member and auto-cancel if they do not renew.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Billing identity</p>
            <p className="mt-3 text-lg font-semibold">
              {member.stripe_customer_id ? "Stripe linked" : "No Stripe customer"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {member.stripe_default_payment_method_id
                ? "Default payment method saved."
                : "No default payment method saved."}
            </p>
            <p className="mt-2 text-xs text-muted">
              {stripeBillingReady
                ? "Gym Stripe billing is ready for checkout and card setup."
                : "Finish Stripe setup in Revenue before starting billing."}
            </p>
          </div>
        </div>
        <div className="border-t border-border px-6 py-4">
          <div className="flex flex-wrap gap-3">
            <form action={freezeMemberMembershipAction}>
              <input name="memberId" type="hidden" value={member.id} />
              <input name="redirectTo" type="hidden" value={memberEditPath} />
              <ServerActionButton
                idleLabel="Freeze for 4 weeks"
                pendingLabel="Freezing..."
                variant="secondary"
              />
            </form>
            <form action={resumeMemberMembershipAction}>
              <input name="memberId" type="hidden" value={member.id} />
              <input name="redirectTo" type="hidden" value={memberEditPath} />
              <ServerActionButton
                idleLabel="Renew membership"
                pendingLabel="Renewing..."
                variant="secondary"
              />
            </form>
            <form action={cancelMemberMembershipAction}>
              <input name="memberId" type="hidden" value={member.id} />
              <input name="redirectTo" type="hidden" value={memberEditPath} />
              <ServerActionButton
                idleLabel="Cancel membership"
                pendingLabel="Canceling..."
                variant="ghost"
              />
            </form>
          </div>
        </div>
        <div className="grid gap-4 border-t border-border px-6 py-6 xl:grid-cols-3">
          <section className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              Assign plan
            </h3>
            <p className="mt-2 text-sm text-muted">
              Create or replace the active subscription immediately from the desk.
            </p>
            {membershipPlans.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No active plans yet. Add plans in Revenue first.
              </p>
            ) : (
              <form action={createSubscriptionAction} className="mt-4 space-y-3">
                <input name="memberId" type="hidden" value={member.id} />
                <input name="redirectTo" type="hidden" value={memberEditPath} />
                <input name="status" type="hidden" value="active" />
                <select
                  name="membershipPlanId"
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  defaultValue={activeSubscription?.membership_plan_id ?? ""}
                  required
                >
                  <option value="" disabled>
                    Select a membership plan
                  </option>
                  {membershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {formatCurrencyFromCents(plan.price_cents)} /{" "}
                      {plan.billing_interval}
                    </option>
                  ))}
                </select>
                <ServerActionButton
                  idleLabel="Save plan assignment"
                  pendingLabel="Saving..."
                  variant="secondary"
                  className="w-full"
                />
              </form>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              Hosted billing checkout
            </h3>
            <p className="mt-2 text-sm text-muted">
              Send this member through Stripe-hosted checkout for the selected plan.
            </p>
            {membershipPlans.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Add at least one active plan before starting checkout.
              </p>
            ) : stripeBillingReady ? (
              <form action={startStripeCheckoutAction} className="mt-4 space-y-3">
                <input name="memberId" type="hidden" value={member.id} />
                <input name="redirectTo" type="hidden" value={memberEditPath} />
                <select
                  name="membershipPlanId"
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  defaultValue={activeSubscription?.membership_plan_id ?? ""}
                  required
                >
                  <option value="" disabled>
                    Select a plan for checkout
                  </option>
                  {membershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {formatCurrencyFromCents(plan.price_cents)} /{" "}
                      {plan.billing_interval}
                    </option>
                  ))}
                </select>
                <ServerActionButton
                  idleLabel="Open hosted billing checkout"
                  pendingLabel="Opening checkout..."
                  className="w-full"
                />
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Stripe billing is not ready for this gym yet. Connect Stripe in Revenue first.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
              Card on file
            </h3>
            <p className="mt-2 text-sm text-muted">
              Start Stripe-hosted card setup so the member can save a default payment method.
            </p>
            {stripeBillingReady ? (
              <form action={startMemberCardSetupAction} className="mt-4 space-y-3">
                <input name="memberId" type="hidden" value={member.id} />
                <input name="redirectTo" type="hidden" value={memberEditPath} />
                <ServerActionButton
                  idleLabel={
                    member.stripe_default_payment_method_id
                      ? "Update card on file"
                      : "Add card on file"
                  }
                  pendingLabel="Opening setup..."
                  variant="secondary"
                  className="w-full"
                />
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Stripe billing must be ready before card setup can begin.
              </p>
            )}
          </section>
        </div>
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Revenue assignment</h2>
          <p className="mt-1 text-sm text-muted">
            Subscription history and current membership pricing for this member.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-border bg-black/20">
            {memberSubscriptions.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted">
                No subscription assigned yet. Use the billing tools above to add one now.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {memberSubscriptions.map((subscription) => (
                  <div
                    key={subscription.id}
                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {subscription.membership_plans?.name ?? "Custom subscription"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {subscription.membership_plans
                          ? `${formatCurrencyFromCents(subscription.membership_plans.price_cents)} per ${subscription.membership_plans.billing_interval}`
                          : "Plan details unavailable"}
                      </p>
                    </div>
                    <div className="text-sm text-muted sm:text-right">
                      <p className="capitalize">{subscription.status.replace("_", " ")}</p>
                      <p className="mt-1">
                        {subscription.current_period_end
                          ? `Ends ${new Date(subscription.current_period_end).toLocaleDateString("en-US")}`
                          : "No period end set"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Active membership options</p>
            {membershipPlans.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No active plans published for this gym yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {membershipPlans.map((plan) => {
                  const isCurrentPlan = activeSubscription?.membership_plan_id === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        isCurrentPlan
                          ? "border-accent/40 bg-accent/10"
                          : "border-border bg-black/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{plan.name}</p>
                          <p className="mt-1 text-sm text-muted">
                            {formatCurrencyFromCents(plan.price_cents)} / {plan.billing_interval}
                          </p>
                        </div>
                        {isCurrentPlan ? (
                          <span className="rounded-full border border-accent/40 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                            current
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Staff notes</h2>
            <p className="mt-1 text-sm text-muted">
              Internal context for coaches, front desk, and billing follow-up.
            </p>
          </div>
          <div className="border-b border-border px-6 py-4">
            <form action={addMemberNoteAction} className="space-y-3">
              <input name="memberId" type="hidden" value={member.id} />
              <input name="redirectTo" type="hidden" value={memberEditPath} />
              <textarea
                name="body"
                required
                rows={4}
                className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                placeholder="Add coaching context, billing follow-up, injury notes, attendance concerns, or front desk instructions."
              />
              <ServerActionButton
                idleLabel="Add note"
                pendingLabel="Saving..."
                variant="secondary"
              />
            </form>
          </div>
          {memberNotes.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">
              No staff notes yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {memberNotes.map((note) => (
                <div key={note.id} className="px-6 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                      <p className="mt-2 text-xs text-muted">
                        Added {new Date(note.created_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: currentGym.data.membership.gymTimezone
                        })}
                      </p>
                    </div>
                    <form action={archiveMemberNoteAction}>
                      <input name="noteId" type="hidden" value={note.id} />
                      <input name="memberId" type="hidden" value={member.id} />
                      <input name="redirectTo" type="hidden" value={memberEditPath} />
                      <ServerActionButton
                        idleLabel="Archive note"
                        pendingLabel="Archiving..."
                        variant="ghost"
                        className="px-3 py-2 text-xs"
                      />
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Follow-up queue</h2>
            <p className="mt-1 text-sm text-muted">
              Internal tasks for retention, billing recovery, and front desk follow-through.
            </p>
          </div>
          <div className="border-b border-border px-6 py-4">
            <form action={createMemberFollowUpTaskAction} className="grid gap-3">
              <input name="memberId" type="hidden" value={member.id} />
              <input name="redirectTo" type="hidden" value={memberEditPath} />
              <input
                name="title"
                required
                className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                placeholder="Task title"
                type="text"
              />
              <textarea
                name="details"
                rows={3}
                className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                placeholder="Optional task details"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  name="taskType"
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  defaultValue="retention"
                >
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="retention">Retention</option>
                  <option value="front_desk">Front desk</option>
                </select>
                <select
                  name="priority"
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  defaultValue="medium"
                >
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                </select>
                <input
                  name="dueAt"
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  type="datetime-local"
                />
              </div>
              <ServerActionButton
                idleLabel="Add follow-up task"
                pendingLabel="Saving..."
                variant="secondary"
              />
            </form>
          </div>
          {memberFollowUpTasks.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">
              No follow-up tasks yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {memberFollowUpTasks.map((task) => (
                <div key={task.id} className="px-6 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{task.title}</p>
                        <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                          {task.task_type.replace("_", " ")}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                          {task.priority}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                          {task.status}
                        </span>
                      </div>
                      {task.details ? (
                        <p className="mt-2 text-sm text-muted">{task.details}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted">
                        {task.due_at
                          ? `Due ${new Date(task.due_at).toLocaleString("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: currentGym.data.membership.gymTimezone
                            })}`
                          : "No due date set"}
                      </p>
                    </div>
                    {task.status === "open" ? (
                      <form action={completeMemberFollowUpTaskAction}>
                        <input name="taskId" type="hidden" value={task.id} />
                        <input name="memberId" type="hidden" value={member.id} />
                        <input name="redirectTo" type="hidden" value={memberEditPath} />
                        <ServerActionButton
                          idleLabel="Mark complete"
                          pendingLabel="Completing..."
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                        />
                      </form>
                    ) : (
                      <p className="text-xs text-muted">
                        Completed{" "}
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleDateString("en-US")
                          : "recently"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Payment history</h2>
            <p className="mt-1 text-sm text-muted">
              Recent payment attempts and outcomes for this member.
            </p>
          </div>
          {memberPayments.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">
              No payment records yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {memberPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {formatCurrencyFromCents(payment.amount_cents)}
                    </p>
                    <p className="mt-1 text-sm text-muted capitalize">
                      {payment.status}
                    </p>
                  </div>
                  <div className="text-sm text-muted sm:text-right">
                    <p>
                      {payment.paid_at
                        ? `Paid ${new Date(payment.paid_at).toLocaleDateString("en-US")}`
                        : "No paid date recorded"}
                    </p>
                    <p className="mt-1">
                      {new Date(payment.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: currentGym.data.membership.gymTimezone
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Lifecycle timeline</h2>
            <p className="mt-1 text-sm text-muted">
              Freeze and cancellation events recorded for this member.
            </p>
          </div>
          {memberLifecycleEvents.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted">
              No lifecycle events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {memberLifecycleEvents.map((event) => (
                <div key={event.id} className="px-6 py-4">
                  <p className="font-medium capitalize">
                    {event.event_type === "frozen"
                      ? "Membership frozen"
                      : "Membership canceled"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {event.event_type === "frozen"
                      ? `Frozen until ${event.frozen_until ?? "not set"}`
                      : event.reason === "freeze_expired"
                        ? "Canceled after the freeze window ended."
                        : `Reason: ${event.reason ?? "not specified"}`}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Send member notification</h2>
          <p className="mt-1 text-sm text-muted">
            Push a direct billing, retention, workout, or general message to this member.
          </p>
        </div>
        <form action={sendMemberNotificationAction} className="grid gap-4 border-b border-border px-6 py-5 xl:grid-cols-2">
          <input name="recipient" type="hidden" value={member.id} />
          <input name="redirectTo" type="hidden" value={`/dashboard/members/${member.id}/edit`} />
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="notificationType">
              Type
            </label>
            <select
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="notificationType"
              name="type"
              defaultValue="general"
            >
              <option value="general">General</option>
              <option value="retention">Retention</option>
              <option value="billing">Billing</option>
              <option value="workout">Workout</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="notificationTitle">
              Title
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="notificationTitle"
              name="title"
              placeholder="Quick update"
              required
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm text-muted" htmlFor="notificationBody">
              Message
            </label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="notificationBody"
              name="body"
              placeholder="Add the member-facing message here."
              required
            />
          </div>
          <div className="xl:col-span-2">
            <ServerActionButton
              idleLabel="Send notification"
              pendingLabel="Sending..."
            />
          </div>
        </form>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent notifications</h2>
          <p className="mt-1 text-sm text-muted">
            The last member-facing notices sent from the system.
          </p>
        </div>
        {memberNotifications.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            No notifications sent yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {memberNotifications.map((notification) => (
              <div key={notification.id} className="px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{notification.title}</p>
                    <p className="mt-1 text-sm text-muted">{notification.body}</p>
                  </div>
                    <div className="text-sm text-muted sm:text-right">
                      <p className="capitalize">
                        {notification.type} - {notification.status} - {notification.read_at ? "read" : "unread"}
                      </p>
                      <p className="mt-1">
                        {new Date(notification.created_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: currentGym.data.membership.gymTimezone
                        })}
                      </p>
                      {notification.read_at ? (
                        <p className="mt-1">
                          Opened{" "}
                          {new Date(notification.read_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: currentGym.data.membership.gymTimezone
                          })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent workouts</h2>
          <p className="mt-1 text-sm text-muted">
            Latest member-logged workouts visible inside the current gym.
          </p>
        </div>
        {memberWorkouts.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            No workouts logged yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {memberWorkouts.map((workout) => (
              <div key={workout.id} className="px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{workout.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {workout.workout_sets.length} set
                      {workout.workout_sets.length === 1 ? "" : "s"}
                      {workout.notes ? ` | ${workout.notes}` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {new Date(workout.performed_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {workout.workout_sets.map((setItem) => (
                    <div
                      key={setItem.id}
                      className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted"
                    >
                      <p className="font-medium text-foreground">
                        {setItem.exercise_name}
                      </p>
                      <p className="mt-1">
                        Set {setItem.set_index} | {setItem.reps} reps | {setItem.weight} lb
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Check-in history</h2>
          <p className="mt-1 text-sm text-muted">
            Recent manual check-ins for this member in the current gym.
          </p>
        </div>
        {memberCheckIns.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            No check-in history recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {memberCheckIns.map((checkIn) => (
              <div
                key={checkIn.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="font-medium capitalize">{checkIn.check_in_method}</p>
                  <p className="mt-1 text-sm text-muted">
                    Recorded in {currentGym.data.membership.gymName}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {new Date(checkIn.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: currentGym.data.membership.gymTimezone
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
