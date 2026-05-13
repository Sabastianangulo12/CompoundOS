import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { createManualCheckInAction } from "@/app/(dashboard)/dashboard/check-ins/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { countTodayCheckIns, filterMembersBySearch, getRecentCheckInsForGym } from "@/lib/check-ins";
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

  const [recentCheckInsResult, membersResult] = await Promise.all([
    getRecentCheckInsForGym(supabase, currentGym.data.membership.gymId, 200),
    supabase
      .from("members")
      .select("id, first_name, last_name, email, status")
      .eq("gym_id", currentGym.data.membership.gymId)
      .in("status", ["lead", "active", "frozen"])
      .order("first_name", {
        ascending: true
      })
  ]);

  if (recentCheckInsResult.error) {
    throw new Error(recentCheckInsResult.error.message);
  }

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  const eligibleMembers = filterMembersBySearch(membersResult.data ?? [], memberSearch);
  const todayCount = countTodayCheckIns(
    recentCheckInsResult.data,
    currentGym.data.membership.gymTimezone
  );
  const recentCheckIns = recentCheckInsResult.data.slice(0, 30);

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
                <button
                  className="rounded-xl border border-border px-4 py-3 text-sm font-medium"
                  type="submit"
                >
                  Search
                </button>
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
                Only members in this gym are available.
              </p>
            </div>
            <button
              className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
              type="submit"
            >
              Record manual check-in
            </button>
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
