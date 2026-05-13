import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
import { archiveMemberAction } from "@/app/(dashboard)/dashboard/members/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  isMemberStatus,
  memberStatuses,
  normalizeMemberSearch
} from "@/lib/members";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembersPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    message?: string;
  }>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = normalizeMemberSearch(resolvedSearchParams?.q);
  const status = resolvedSearchParams?.status;
  const selectedStatus = status && isMemberStatus(status) ? status : "all";

  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  let membersQuery = supabase
    .from("members")
    .select("*")
    .eq("gym_id", currentGym.data.membership.gymId)
    .order("created_at", {
      ascending: false
    });

  if (selectedStatus !== "all") {
    membersQuery = membersQuery.eq("status", selectedStatus);
  }

  if (query) {
    const safeQuery = query.replace(/[%,'()]/g, " ").trim();
    membersQuery = membersQuery.or(
      [
        `first_name.ilike.%${safeQuery}%`,
        `last_name.ilike.%${safeQuery}%`,
        `email.ilike.%${safeQuery}%`
      ].join(",")
    );
  }

  const { data: members, error } = await membersQuery;

  if (error) {
    throw new Error(error.message);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DashboardPageHeader
          eyebrow="Members"
          title="Member roster"
          description={`Search, filter, and manage membership records for ${currentGym.data.membership.gymName}.`}
        />
        <Link
          className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-black"
          href="/dashboard/members/new"
        >
          Add member
        </Link>
      </div>

      <section className="panel p-6">
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="q">
              Search
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              defaultValue={query}
              id="q"
              name="q"
              placeholder="Search by name or email"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="status">
              Status
            </label>
            <select
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              defaultValue={selectedStatus}
              id="status"
              name="status"
            >
              <option value="all">All statuses</option>
              {memberStatuses.map((memberStatus) => (
                <option key={memberStatus} value={memberStatus}>
                  {memberStatus.charAt(0).toUpperCase() + memberStatus.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              className="h-12 rounded-xl border border-border px-4 text-sm font-medium text-foreground"
              type="submit"
            >
              Apply
            </button>
            <Link
              className="inline-flex h-12 items-center rounded-xl px-4 text-sm text-muted"
              href="/dashboard/members"
            >
              Reset
            </Link>
          </div>
        </form>
        {resolvedSearchParams?.message ? (
          <div className="mt-4 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
            {resolvedSearchParams.message}
          </div>
        ) : null}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Current gym roster</h2>
            <p className="mt-1 text-sm text-muted">
              {members.length} member{members.length === 1 ? "" : "s"} scoped to{" "}
              {currentGym.data.membership.gymName}.
            </p>
          </div>
        </div>
        {members.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-medium">No members yet</p>
            <p className="mt-2 text-sm text-muted">
              Start with your first lead or active member for this gym.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-black/10 text-left text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Member</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                          {member.id.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted">
                      <div>{member.email ?? "No email"}</div>
                      <div className="mt-1">{member.phone ?? "No phone"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <MemberStatusBadge status={member.status} />
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {member.joined_at ?? "Not set"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          className="text-sm font-medium text-foreground"
                          href={`/dashboard/members/${member.id}/edit`}
                        >
                          Edit
                        </Link>
                        <form action={archiveMemberAction}>
                          <input name="memberId" type="hidden" value={member.id} />
                          <button
                            className="text-sm text-muted hover:text-foreground"
                            type="submit"
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
