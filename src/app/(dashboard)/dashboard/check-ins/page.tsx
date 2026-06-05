import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { createMemberFollowUpTaskAction } from "@/app/(dashboard)/dashboard/members/actions";
import { createManualCheckInAction } from "@/app/(dashboard)/dashboard/check-ins/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { countTodayCheckIns, filterMembersBySearch, getRecentCheckInsForGym } from "@/lib/check-ins";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CheckInsPageProps = {
  searchParams?: Promise<{
    memberSearch?: string;
    message?: string;
  }>;
};

export default async function CheckInsPage({ searchParams }: CheckInsPageProps) {
  const resolvedSearchParams = await searchParams;
  const memberSearch = resolvedSearchParams?.memberSearch?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const [recentCheckInsResult, membersResult, subscriptionsResult, followUpTasksResult] = await Promise.all([
    getRecentCheckInsForGym(supabase, currentGym.data.membership.gymId, 200),
    supabase
      .from("members")
      .select("id, first_name, last_name, email, status, frozen_until, stripe_default_payment_method_id")
      .eq("gym_id", currentGym.data.membership.gymId)
      .in("status", ["lead", "active", "frozen"])
      .order("first_name", {
        ascending: true
      }),
    supabase
      .from("subscriptions")
      .select(
        `
          id,
          member_id,
          status,
          membership_plans (
            name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_follow_up_tasks")
      .select("id, member_id, priority")
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
  ]);

  if (recentCheckInsResult.error) {
    throw new Error(recentCheckInsResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }
  if (subscriptionsResult.error) {
    throw new Error(subscriptionsResult.error.message);
  }
  if (followUpTasksResult.error) {
    throw new Error(followUpTasksResult.error.message);
  }

  const members = membersResult.data ?? [];
  const matchingMembers = filterMembersBySearch(members, memberSearch);
  const eligibleMembers = matchingMembers.slice(0, memberSearch ? 60 : 80);
  const subscriptions = (subscriptionsResult.data ?? []) as Array<{
    id: string;
    member_id: string;
    status: string;
    membership_plans: Array<{ name: string }> | null;
  }>;
  const followUpTasks = (followUpTasksResult.data ?? []) as Array<{
    id: string;
    member_id: string;
    priority: string;
  }>;
  const todayCount = countTodayCheckIns(
    recentCheckInsResult.data,
    currentGym.data.membership.gymTimezone
  );
  const recentCheckIns = recentCheckInsResult.data.slice(0, 30);
  const qrCheckIns = recentCheckInsResult.data.filter(
    (checkIn) => checkIn.check_in_method === "qr"
  );
  const manualCheckIns = recentCheckInsResult.data.filter(
    (checkIn) => checkIn.check_in_method === "manual"
  );
  const uniqueMemberIdsToday = new Set(
    recentCheckInsResult.data
      .filter((checkIn) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: currentGym.data.membership.gymTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date(checkIn.created_at)) ===
        new Intl.DateTimeFormat("en-CA", {
          timeZone: currentGym.data.membership.gymTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date())
      )
      .map((checkIn) => checkIn.member_id)
  );
  const dailyTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const label = date.toLocaleDateString("en-US", { weekday: "short" });
    const count = recentCheckInsResult.data.filter((checkIn) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: currentGym.data.membership.gymTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(checkIn.created_at)) ===
      new Intl.DateTimeFormat("en-CA", {
        timeZone: currentGym.data.membership.gymTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(date)
    ).length;

    return {
      key: `${date.toISOString()}-${index}`,
      label,
      count
    };
  });
  const peakDayCount = Math.max(...dailyTrend.map((day) => day.count), 1);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const latestSubscriptionByMember = new Map<string, (typeof subscriptions)[number]>();
  subscriptions.forEach((subscription) => {
    if (!latestSubscriptionByMember.has(subscription.member_id)) {
      latestSubscriptionByMember.set(subscription.member_id, subscription);
    }
  });
  const openTaskCountByMember = new Map<string, number>();
  followUpTasks.forEach((task) => {
    openTaskCountByMember.set(task.member_id, (openTaskCountByMember.get(task.member_id) ?? 0) + 1);
  });
  const todayArrivalIssues = Array.from(uniqueMemberIdsToday)
    .map((memberId) => {
      const member = memberById.get(memberId);
      if (!member) {
        return null;
      }
      const subscription = latestSubscriptionByMember.get(memberId) ?? null;
      const issues: string[] = [];

      if (member.status === "frozen") {
        issues.push(`Frozen until ${member.frozen_until ?? "not set"}`);
      }

      if (subscription?.status === "past_due") {
        issues.push("Past due subscription");
      }

      if (
        subscription &&
        subscription.status !== "canceled" &&
        !member.stripe_default_payment_method_id
      ) {
        issues.push("Missing card on file");
      }

      if (issues.length === 0) {
        return null;
      }

      return {
        member,
        subscription,
        issues,
        openTaskCount: openTaskCountByMember.get(memberId) ?? 0
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Check-ins"
        title="Attendance and front desk"
        description={`Manual check-ins and recent gym activity for ${currentGym.data.membership.gymName}.`}
      />

      <div className="flex justify-end">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium"
          href="/dashboard/check-ins/scan"
        >
          Open QR scan
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Today</p>
          <p className="mt-3 text-3xl font-semibold">{todayCount}</p>
          <p className="mt-2 text-sm text-muted">Total check-ins recorded today.</p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Unique arrivals</p>
          <p className="mt-3 text-3xl font-semibold">{uniqueMemberIdsToday.size}</p>
          <p className="mt-2 text-sm text-muted">Distinct members checked in today.</p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">QR share</p>
          <p className="mt-3 text-3xl font-semibold">{qrCheckIns.length}</p>
          <p className="mt-2 text-sm text-muted">Recent QR-based arrivals in this gym.</p>
        </div>
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Manual share</p>
          <p className="mt-3 text-3xl font-semibold">{manualCheckIns.length}</p>
          <p className="mt-2 text-sm text-muted">Recent front desk manual check-ins.</p>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">7-day attendance trend</h2>
          <p className="mt-1 text-sm text-muted">
            Quick read on recent attendance momentum before you start the front desk shift.
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="flex h-44 items-end justify-between gap-4">
            {dailyTrend.map((day) => {
              const height = Math.max((day.count / peakDayCount) * 120, day.count > 0 ? 16 : 8);
              return (
                <div
                  key={day.key}
                  className="flex flex-1 flex-col items-center justify-end gap-3"
                >
                  <p className="text-xs text-muted">{day.count}</p>
                  <div
                    className="w-full max-w-9 rounded-full bg-accent"
                    style={{ height }}
                  />
                  <p className="text-xs text-muted">{day.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Today&apos;s arrival issues</h2>
          <p className="mt-1 text-sm text-muted">
            Members who already arrived today but still need billing or membership follow-up.
          </p>
        </div>
        <div className="divide-y divide-border">
          {todayArrivalIssues.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No billing or membership issues among today&apos;s arrivals.
            </div>
          ) : (
            todayArrivalIssues.map((entry) => (
              <div
                key={entry.member.id}
                className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {entry.member.first_name} {entry.member.last_name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {toOneRelation(entry.subscription?.membership_plans)?.name ?? "No active plan"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.issues.map((issue) => (
                      <span
                        key={`${entry.member.id}-${issue}`}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                      >
                        {issue}
                      </span>
                    ))}
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                      {entry.openTaskCount} open task{entry.openTaskCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    className="text-sm font-medium text-foreground"
                    href={`/dashboard/members/${entry.member.id}/edit`}
                  >
                    Open member
                  </Link>
                  <MemberQuickNotifyForm
                    memberId={entry.member.id}
                    redirectTo="/dashboard/check-ins"
                    title="We need to resolve an issue on your account"
                    body={`Hi ${entry.member.first_name}, you checked in today and we noticed an account issue: ${entry.issues.join(", ")}. Please stop by the front desk so we can help.`}
                    type="billing"
                    label="Notify"
                  />
                  {entry.openTaskCount === 0 ? (
                    <form action={createMemberFollowUpTaskAction}>
                      <input type="hidden" name="memberId" value={entry.member.id} />
                      <input type="hidden" name="redirectTo" value="/dashboard/check-ins" />
                      <input type="hidden" name="title" value="Resolve arrival issue from front desk" />
                      <input
                        type="hidden"
                        name="details"
                        value={`Member checked in today with these issues: ${entry.issues.join(", ")}.`}
                      />
                      <input type="hidden" name="taskType" value="front_desk" />
                      <input type="hidden" name="priority" value="high" />
                      <ServerActionButton
                        idleLabel="Create task"
                        pendingLabel="Creating..."
                        variant="ghost"
                        className="px-0 py-0 text-sm"
                      />
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Manual check-in</h2>
              <p className="mt-2 text-sm text-muted">
                Record a front-desk arrival for a member in the current gym.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                Today
              </p>
              <p className="mt-2 text-3xl font-semibold">{todayCount}</p>
            </div>
          </div>

          {resolvedSearchParams?.message ? (
            <div className="mt-4 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
              {resolvedSearchParams.message}
            </div>
          ) : null}

          <form className="mt-6 space-y-4">
            <div>
              <label
                className="mb-2 block text-sm text-muted"
                htmlFor="memberSearch"
              >
                Search members
              </label>
              <div className="flex gap-3">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={memberSearch}
                  id="memberSearch"
                  name="memberSearch"
                  placeholder="Search by name or email"
                />
                <ServerActionButton
                  idleLabel="Search"
                  pendingLabel="Searching..."
                  variant="secondary"
                />
              </div>
            </div>
          </form>

          <form action={createManualCheckInAction} className="mt-6 space-y-4">
            <input name="memberSearch" type="hidden" value={memberSearch} />
            <div>
              <label className="mb-2 block text-sm text-muted" htmlFor="memberId">
                Select member
              </label>
              <select
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                id="memberId"
                name="memberId"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Choose a member
                </option>
                {eligibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                    {member.email ? ` - ${member.email}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted">
                Showing {eligibleMembers.length} of {matchingMembers.length} matching members.
                Search by name or email to narrow the list instantly.
              </p>
            </div>
            <ServerActionButton
              idleLabel="Record manual check-in"
              pendingLabel="Recording..."
            />
          </form>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Recent check-ins</h2>
            <p className="mt-1 text-sm text-muted">
              Latest front-desk activity for the current gym.
            </p>
          </div>
          {recentCheckIns.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-lg font-medium">No check-ins yet</p>
              <p className="mt-2 text-sm text-muted">
                The most recent arrivals will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentCheckIns.map((checkIn) => (
                <div
                  key={checkIn.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {checkIn.members?.first_name} {checkIn.members?.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {checkIn.members?.email ?? "No email on file"}
                    </p>
                    {checkIn.members?.id ? (
                      <Link
                        className="mt-2 inline-flex text-sm font-medium text-foreground"
                        href={`/dashboard/members/${checkIn.members.id}/edit`}
                      >
                        Open member
                      </Link>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted sm:text-right">
                    <p className="capitalize">{checkIn.check_in_method}</p>
                    <p className="mt-1">
                      {new Date(checkIn.created_at).toLocaleString("en-US", {
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
      </div>
    </section>
  );
}
