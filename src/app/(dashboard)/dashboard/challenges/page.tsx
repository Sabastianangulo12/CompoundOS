import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import {
  activateChallengeAction,
  archiveChallengeAction,
  createChallengeAction
} from "@/app/(dashboard)/dashboard/challenges/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ChallengesPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function ChallengesPage({
  searchParams
}: ChallengesPageProps) {
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

  const [challengesResult, membersResult, checkInsResult, workoutsResult] = await Promise.all([
    supabase
      .from("gym_challenges")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("status", { ascending: true })
      .order("starts_on", { ascending: false }),
    supabase
      .from("members")
      .select("id, first_name, last_name", { count: "exact" })
      .eq("gym_id", currentGym.data.membership.gymId)
      .neq("status", "canceled"),
    supabase
      .from("check_ins")
      .select("member_id, created_at")
      .eq("gym_id", currentGym.data.membership.gymId),
    supabase
      .from("workouts")
      .select("member_id, performed_at")
      .eq("gym_id", currentGym.data.membership.gymId)
  ]);

  if (challengesResult.error) {
    throw new Error(challengesResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  if (checkInsResult.error) {
    throw new Error(checkInsResult.error.message);
  }

  if (workoutsResult.error) {
    throw new Error(workoutsResult.error.message);
  }

  const challenges = challengesResult.data ?? [];
  const activeChallenges = challenges.filter((challenge) => challenge.status === "active");
  const archivedChallenges = challenges.filter((challenge) => challenge.status === "archived");
  const members = membersResult.data ?? [];
  const checkIns = checkInsResult.data ?? [];
  const workouts = workoutsResult.data ?? [];

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Challenges"
        title="Challenge engine"
        description={`Launch weekly and monthly competition loops for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="Active challenges"
          value={String(activeChallenges.length)}
          description="Current live competitions visible in the member app."
        />
        <PlaceholderCard
          title="Archived challenges"
          value={String(archivedChallenges.length)}
          description="Completed challenge history you can reuse later."
        />
        <PlaceholderCard
          title="Eligible members"
          value={String(membersResult.count ?? 0)}
          description="Non-canceled members in the current gym."
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Create challenge</h2>
          <p className="mt-1 text-sm text-muted">
            Start simple with steps, visits, or workouts. The member app will show progress automatically.
          </p>
        </div>
        <div className="p-6">
          <form action={createChallengeAction} className="grid gap-4 md:grid-cols-2">
            <input
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="title"
              placeholder="Summer steps race"
              required
            />
            <select
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="metricType"
              defaultValue="steps"
            >
              <option value="steps">Steps</option>
              <option value="visits">Visits</option>
              <option value="workouts">Workouts</option>
            </select>
            <textarea
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none md:col-span-2"
              name="description"
              placeholder="Short challenge description"
              rows={3}
            />
            <input
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="goalValue"
              placeholder="Goal value"
              required
              type="number"
              min="1"
            />
            <select
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="period"
              defaultValue="weekly"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="startsOn"
              required
              type="date"
            />
            <input
              className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
              name="endsOn"
              required
              type="date"
            />
            <div className="md:col-span-2">
              <button
                className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
                type="submit"
              >
                Create challenge
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Live challenges</h2>
          <p className="mt-1 text-sm text-muted">
            Active challenge lineup flowing into the member experience.
          </p>
        </div>
        <div className="divide-y divide-border">
          {activeChallenges.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">No active challenges yet.</div>
          ) : (
            activeChallenges.map((challenge) => {
              const standings = buildChallengeStandings({
                challenge,
                members,
                checkIns,
                workouts
              });
              const topThree = standings.slice(0, 3);
              const finishers = standings.filter(
                (entry) => entry.progress >= challenge.goal_value
              ).length;

              return (
                <div
                  key={challenge.id}
                  className="space-y-4 px-6 py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-medium">{challenge.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {challenge.metric_type} | goal {challenge.goal_value} | {challenge.period}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {challenge.starts_on} to {challenge.ends_on}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                        {finishers} finisher{finishers === 1 ? "" : "s"}
                      </span>
                      <form action={archiveChallengeAction}>
                        <input name="challengeId" type="hidden" value={challenge.id} />
                        <button
                          className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
                          type="submit"
                        >
                          Archive
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {topThree.length === 0 ? (
                      <p className="text-sm text-muted">No challenge progress recorded yet.</p>
                    ) : (
                      topThree.map((entry, index) => (
                        <div
                          key={entry.memberId}
                          className="rounded-2xl border border-border bg-black/20 px-4 py-4"
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-muted">
                            Rank {index + 1}
                          </p>
                          <p className="mt-2 font-medium">{entry.memberName}</p>
                          <p className="mt-1 text-sm text-muted">
                            {formatChallengeMetricValue(challenge.metric_type, entry.progress)} /{" "}
                            {formatChallengeMetricValue(challenge.metric_type, challenge.goal_value)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Archived challenges</h2>
          <p className="mt-1 text-sm text-muted">
            Completed or paused challenge history that can be reactivated later.
          </p>
        </div>
        <div className="divide-y divide-border">
          {archivedChallenges.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">No archived challenges yet.</div>
          ) : (
            archivedChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="font-medium">{challenge.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {challenge.metric_type} | goal {challenge.goal_value} | {challenge.period}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {challenge.starts_on} to {challenge.ends_on}
                  </p>
                </div>
                <form action={activateChallengeAction}>
                  <input name="challengeId" type="hidden" value={challenge.id} />
                  <button
                    className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
                    type="submit"
                  >
                    Reactivate
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

type ChallengeRow = Database["public"]["Tables"]["gym_challenges"]["Row"];
type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
};

function buildChallengeStandings(input: {
  challenge: ChallengeRow;
  members: MemberRow[];
  checkIns: Array<{ member_id: string; created_at: string }>;
  workouts: Array<{ member_id: string; performed_at: string }>;
}) {
  const rangeStart = new Date(`${input.challenge.starts_on}T00:00:00.000Z`);
  const rangeEnd = new Date(`${input.challenge.ends_on}T23:59:59.999Z`);

  return input.members
    .map((member) => {
      const progress = getMemberChallengeProgress({
        challenge: input.challenge,
        memberId: member.id,
        checkIns: input.checkIns,
        workouts: input.workouts,
        rangeStart,
        rangeEnd
      });

      return {
        memberId: member.id,
        memberName: `${member.first_name} ${member.last_name}`,
        progress
      };
    })
    .sort((left, right) => right.progress - left.progress);
}

function getMemberChallengeProgress(input: {
  challenge: ChallengeRow;
  memberId: string;
  checkIns: Array<{ member_id: string; created_at: string }>;
  workouts: Array<{ member_id: string; performed_at: string }>;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  if (input.challenge.metric_type === "steps") {
    const checkInCount = input.checkIns.filter((checkIn) => {
      const createdAt = new Date(checkIn.created_at);
      return (
        checkIn.member_id === input.memberId &&
        createdAt >= input.rangeStart &&
        createdAt <= input.rangeEnd
      );
    }).length;
    const workoutCount = input.workouts.filter((workout) => {
      const performedAt = new Date(workout.performed_at);
      return (
        workout.member_id === input.memberId &&
        performedAt >= input.rangeStart &&
        performedAt <= input.rangeEnd
      );
    }).length;

    return checkInCount * 1700 + workoutCount * 2600 + 2800;
  }

  if (input.challenge.metric_type === "workouts") {
    return input.workouts.filter((workout) => {
      const performedAt = new Date(workout.performed_at);
      return (
        workout.member_id === input.memberId &&
        performedAt >= input.rangeStart &&
        performedAt <= input.rangeEnd
      );
    }).length;
  }

  return input.checkIns.filter((checkIn) => {
    const createdAt = new Date(checkIn.created_at);
    return (
      checkIn.member_id === input.memberId &&
      createdAt >= input.rangeStart &&
      createdAt <= input.rangeEnd
    );
  }).length;
}

function formatChallengeMetricValue(metricType: string, value: number) {
  if (metricType === "steps") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  return String(value);
}
