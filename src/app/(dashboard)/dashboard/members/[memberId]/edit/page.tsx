import { notFound, redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberForm } from "@/components/members/member-form";
import {
  archiveMemberAction,
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

  const [recentCheckInsResult, subscriptionsResult, workoutsResult] = await Promise.all([
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
    )
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

  const memberCheckIns = recentCheckInsResult.data.filter(
    (checkIn) => checkIn.member_id === member.id
  );
  const memberSubscriptions = subscriptionsResult.data ?? [];
  const memberWorkouts = workoutsResult.data ?? [];

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
          <button
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
            type="submit"
          >
            Archive member
          </button>
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
          joinedAt: member.joined_at
        }}
      />
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Revenue assignment</h2>
          <p className="mt-1 text-sm text-muted">
            Subscription history for this member in the current gym.
          </p>
        </div>
        {memberSubscriptions.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted">
            No subscription assigned yet. Create one in Revenue.
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
