import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
import {
  archiveMemberAction,
  createMemberFollowUpTaskAction,
  freezeMemberMembershipAction,
  resumeMemberMembershipAction
} from "@/app/(dashboard)/dashboard/members/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  isMemberStatus,
  memberStatuses,
  normalizeMemberSearch
} from "@/lib/members";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembersPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    risk?: string;
    page?: string;
    message?: string;
  }>;
};

type MemberLite = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: "lead" | "active" | "frozen" | "canceled";
  joined_at: string | null;
  created_at: string;
  frozen_until: string | null;
  stripe_default_payment_method_id: string | null;
};

type SubscriptionLite = {
  id: string;
  member_id: string;
  status: string;
  current_period_end: string | null;
  membership_plans: Array<{
    name: string;
    billing_interval: string;
  }> | null;
};

type FollowUpTaskLite = {
  id: string;
  member_id: string;
  priority: string;
  task_type: string;
};

type InsightLite = {
  id: string;
  member_id: string | null;
  priority: string;
  type: string;
};

type NotificationLite = {
  id: string;
  member_id: string;
  title: string;
  type: "retention" | "workout" | "billing" | "general";
  created_at: string;
};

type RiskFilter =
  | "all"
  | "needs_attention"
  | "billing"
  | "no_visit"
  | "frozen"
  | "no_plan"
  | "no_card"
  | "tasks";

type MemberRiskTag = {
  key: Exclude<RiskFilter, "all">;
  label: string;
  tone: string;
};

type EnrichedMember = {
  member: MemberLite;
  lastCheckInAt: string | null;
  daysSinceLastVisit: number | null;
  subscription: SubscriptionLite | null;
  lastNotification: NotificationLite | null;
  openTaskCount: number;
  highPriorityTaskCount: number;
  insightCount: number;
  riskTags: MemberRiskTag[];
};

const riskFilters: Array<{
  value: RiskFilter;
  label: string;
}> = [
  { value: "all", label: "All members" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "billing", label: "Billing risk" },
  { value: "no_visit", label: "No recent visit" },
  { value: "frozen", label: "Frozen" },
  { value: "no_plan", label: "No active plan" },
  { value: "no_card", label: "Missing card" },
  { value: "tasks", label: "Open tasks" }
];

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = normalizeMemberSearch(resolvedSearchParams?.q);
  const status = resolvedSearchParams?.status;
  const risk = resolvedSearchParams?.risk;
  const page = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);
  const selectedStatus = status && isMemberStatus(status) ? status : "all";
  const selectedRisk = isRiskFilter(risk) ? risk : "all";
  const pageSize = 18;

  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const gymId = currentGym.data.membership.gymId;
  const [membersResult, recentCheckInsResult, subscriptionsResult, followUpTasksResult, insightsResult, notificationsResult] =
    await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, last_name, email, phone, status, joined_at, created_at, frozen_until, stripe_default_payment_method_id"
        )
        .eq("gym_id", gymId)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_latest_member_check_ins_for_gym", {
        p_gym_id: gymId
      }),
      supabase
        .from("subscriptions")
        .select(
          `
            id,
            member_id,
            status,
            current_period_end,
            membership_plans (
              name,
              billing_interval
            )
          `
        )
        .eq("gym_id", gymId)
        .order("created_at", { ascending: false }),
      supabase
        .from("member_follow_up_tasks")
        .select("id, member_id, priority, task_type")
        .eq("gym_id", gymId)
        .eq("status", "open"),
      supabase
        .from("ai_insights")
        .select("id, member_id, priority, type")
        .eq("gym_id", gymId)
        .eq("status", "open"),
      supabase.rpc("get_latest_member_notifications_for_gym", {
        p_gym_id: gymId
      })
    ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (recentCheckInsResult.error) throw new Error(recentCheckInsResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (followUpTasksResult.error) throw new Error(followUpTasksResult.error.message);
  if (insightsResult.error) throw new Error(insightsResult.error.message);
  if (notificationsResult.error) throw new Error(notificationsResult.error.message);

  const members = (membersResult.data ?? []) as MemberLite[];
  const recentCheckIns = (recentCheckInsResult.data ?? []) as Array<{
    member_id: string;
    created_at: string;
  }>;
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionLite[];
  const followUpTasks = (followUpTasksResult.data ?? []) as FollowUpTaskLite[];
  const insights = (insightsResult.data ?? []) as InsightLite[];
  const notifications = (notificationsResult.data ?? []) as NotificationLite[];

  const latestCheckInByMember = new Map(
    recentCheckIns.map((checkIn) => [checkIn.member_id, checkIn.created_at])
  );

  const latestSubscriptionByMember = new Map<string, SubscriptionLite>();
  for (const subscription of subscriptions) {
    if (!latestSubscriptionByMember.has(subscription.member_id)) {
      latestSubscriptionByMember.set(subscription.member_id, subscription);
    }
  }

  const openTaskCounts = new Map<string, number>();
  const highPriorityTaskCounts = new Map<string, number>();
  for (const task of followUpTasks) {
    openTaskCounts.set(task.member_id, (openTaskCounts.get(task.member_id) ?? 0) + 1);
    if (task.priority === "high") {
      highPriorityTaskCounts.set(
        task.member_id,
        (highPriorityTaskCounts.get(task.member_id) ?? 0) + 1
      );
    }
  }

  const insightCounts = new Map<string, number>();
  for (const insight of insights) {
    if (!insight.member_id) continue;
    insightCounts.set(insight.member_id, (insightCounts.get(insight.member_id) ?? 0) + 1);
  }

  const latestNotificationByMember = new Map(
    notifications.map((notification) => [notification.member_id, notification])
  );

  const enrichedMembers = members.map<EnrichedMember>((member) => {
    const lastCheckInAt = latestCheckInByMember.get(member.id) ?? null;
    const daysSinceLastVisit = lastCheckInAt
      ? Math.floor((Date.now() - new Date(lastCheckInAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const subscription = latestSubscriptionByMember.get(member.id) ?? null;
    const openTaskCount = openTaskCounts.get(member.id) ?? 0;
    const highPriorityTaskCount = highPriorityTaskCounts.get(member.id) ?? 0;
    const insightCount = insightCounts.get(member.id) ?? 0;

    return {
      member,
      lastCheckInAt,
      daysSinceLastVisit,
      subscription,
      lastNotification: latestNotificationByMember.get(member.id) ?? null,
      openTaskCount,
      highPriorityTaskCount,
      insightCount,
      riskTags: buildMemberRiskTags({
        member,
        subscription,
        daysSinceLastVisit,
        openTaskCount,
        highPriorityTaskCount,
        insightCount
      })
    };
  });

  const filteredMembers = enrichedMembers.filter((entry) => {
    if (selectedStatus !== "all" && entry.member.status !== selectedStatus) {
      return false;
    }

    if (query) {
      const haystack = [
        entry.member.first_name,
        entry.member.last_name,
        entry.member.email ?? "",
        entry.member.phone ?? ""
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query.toLowerCase())) {
        return false;
      }
    }

    return matchesRiskFilter(entry, selectedRisk);
  });
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    if (selectedRisk !== "all") params.set("risk", selectedRisk);
    params.set("page", String(nextPage));
    return `/dashboard/members?${params.toString()}`;
  };

  const activeMembersCount = enrichedMembers.filter(
    (entry) => entry.member.status === "active"
  ).length;
  const attentionCount = enrichedMembers.filter(
    (entry) => entry.riskTags.length > 0 && entry.member.status !== "canceled"
  ).length;
  const noVisitCount = enrichedMembers.filter((entry) =>
    entry.riskTags.some((tag) => tag.key === "no_visit")
  ).length;
  const billingRiskCount = enrichedMembers.filter((entry) =>
    entry.riskTags.some((tag) => tag.key === "billing" || tag.key === "no_card")
  ).length;
  const frozenCount = enrichedMembers.filter((entry) => entry.member.status === "frozen").length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <DashboardPageHeader
          eyebrow="Members"
          title="Member roster"
          description={`Search, filter, and operate on membership records for ${currentGym.data.membership.gymName}.`}
        />
        <Link
          className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-black"
          href="/dashboard/members/new"
        >
          Add member
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <PlaceholderCard
          title="Roster size"
          value={String(enrichedMembers.length)}
          description="Total member records in this gym."
        />
        <PlaceholderCard
          title="Active members"
          value={String(activeMembersCount)}
          description="Currently active memberships."
        />
        <PlaceholderCard
          title="Needs attention"
          value={String(attentionCount)}
          description="Members with at least one risk signal or task."
        />
        <PlaceholderCard
          title="No recent visit"
          value={String(noVisitCount)}
          description="No check-in for at least 14 days."
        />
        <PlaceholderCard
          title="Billing risks"
          value={String(billingRiskCount + frozenCount)}
          description="Past due, missing card, or frozen memberships."
        />
      </div>

      <section className="panel-hero p-6">
        <form className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_220px_220px_auto]">
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="q">
              Search
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              defaultValue={query}
              id="q"
              name="q"
              placeholder="Search by name, email, or phone"
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
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="risk">
              Risk view
            </label>
            <select
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              defaultValue={selectedRisk}
              id="risk"
              name="risk"
            >
              {riskFilters.map((riskFilter) => (
                <option key={riskFilter.value} value={riskFilter.value}>
                  {riskFilter.label}
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
            <h2 className="text-lg font-semibold">Operator roster</h2>
            <p className="mt-1 text-sm text-muted">
              {filteredMembers.length} matching member
              {filteredMembers.length === 1 ? "" : "s"} in {currentGym.data.membership.gymName}. Showing {paginatedMembers.length} on page {currentPage} of {totalPages}.
            </p>
          </div>
        </div>
        {filteredMembers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-lg font-medium">No matching members</p>
            <p className="mt-2 text-sm text-muted">
              Try changing the search, status, or risk filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="dense-table min-w-full divide-y divide-border text-sm">
              <thead className="bg-black/10 text-left text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Member</th>
                  <th className="px-6 py-3 font-medium">Last visit</th>
                  <th className="px-6 py-3 font-medium">Billing</th>
                  <th className="px-6 py-3 font-medium">Alerts</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedMembers.map((entry) => {
                  const { member, subscription, riskTags } = entry;
                  const hasOpenTask = entry.openTaskCount > 0;

                  return (
                    <tr key={member.id} className="align-top hover:bg-white/5">
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div>
                            <p className="font-medium">
                              {member.first_name} {member.last_name}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {member.email ?? "No email"} {member.phone ? `| ${member.phone}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <MemberStatusBadge status={member.status} />
                            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                              Joined {member.joined_at ?? member.created_at.slice(0, 10)}
                            </span>
                            {member.frozen_until ? (
                              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                                Frozen until {member.frozen_until}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted">
                        <p>{formatLastVisitLabel(entry.lastCheckInAt, entry.daysSinceLastVisit)}</p>
                        <p className="mt-1 text-xs">
                          {entry.lastCheckInAt
                            ? new Date(entry.lastCheckInAt).toLocaleString("en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: currentGym.data.membership.gymTimezone
                              })
                            : "No check-ins yet"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-muted">
                        <p className="font-medium text-foreground">
                            {toOneRelation(subscription?.membership_plans)?.name ?? "No active plan"}
                        </p>
                        <p className="mt-1 text-xs">
                          {formatSubscriptionStatus(subscription, member)}
                        </p>
                        <p className="mt-1 text-xs">
                          {member.stripe_default_payment_method_id
                            ? "Card on file"
                            : "No saved card"}
                        </p>
                        <p className="mt-2 text-xs">
                          {entry.lastNotification
                            ? `Last contact ${formatRelativeNotification(entry.lastNotification.created_at)}`
                            : "No recent member notification"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {riskTags.length === 0 ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                              Stable
                            </span>
                          ) : (
                            riskTags.map((tag) => (
                              <span
                                key={`${member.id}-${tag.key}`}
                                className={[
                                  "rounded-full border px-2.5 py-1 text-xs",
                                  tag.tone
                                ].join(" ")}
                              >
                                {tag.label}
                              </span>
                            ))
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {entry.openTaskCount} open task{entry.openTaskCount === 1 ? "" : "s"} |{" "}
                          {entry.insightCount} open insight{entry.insightCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-end gap-2">
                          <Link className="action-link" href={`/dashboard/members/${member.id}/edit`}>
                            Open profile
                          </Link>
                          {member.status === "frozen" ? (
                            <form action={resumeMemberMembershipAction}>
                              <input name="memberId" type="hidden" value={member.id} />
                              <input name="redirectTo" type="hidden" value="/dashboard/members" />
                              <ServerActionButton
                                className="px-0 py-0 text-sm font-normal"
                                idleLabel="Renew membership"
                                pendingLabel="Renewing..."
                                variant="ghost"
                              />
                            </form>
                          ) : member.status !== "canceled" ? (
                            <form action={freezeMemberMembershipAction}>
                              <input name="memberId" type="hidden" value={member.id} />
                              <input name="redirectTo" type="hidden" value="/dashboard/members" />
                              <ServerActionButton
                                className="px-0 py-0 text-sm font-normal"
                                idleLabel="Freeze 4 weeks"
                                pendingLabel="Freezing..."
                                variant="ghost"
                              />
                            </form>
                          ) : null}
                          {!hasOpenTask && member.status !== "canceled" ? (
                            <form action={createMemberFollowUpTaskAction}>
                              <input name="memberId" type="hidden" value={member.id} />
                              <input name="redirectTo" type="hidden" value="/dashboard/members" />
                              <input
                                name="title"
                                type="hidden"
                                value={buildDefaultTaskTitle(entry)}
                              />
                              <input
                                name="details"
                                type="hidden"
                                value={buildDefaultTaskDetails(entry)}
                              />
                              <input
                                name="taskType"
                                type="hidden"
                                value={buildDefaultTaskType(entry)}
                              />
                              <input
                                name="priority"
                                type="hidden"
                                value={entry.highPriorityTaskCount > 0 || riskTags.length >= 2 ? "high" : "medium"}
                              />
                              <ServerActionButton
                                className="px-0 py-0 text-sm font-normal"
                                idleLabel="Create task"
                                pendingLabel="Creating..."
                                variant="ghost"
                              />
                            </form>
                          ) : null}
                          {member.status !== "canceled" ? (
                            <MemberQuickNotifyForm
                              memberId={member.id}
                              redirectTo="/dashboard/members"
                              title={buildDefaultNotificationTitle(entry)}
                              body={buildDefaultNotificationBody(entry)}
                              type={buildDefaultNotificationType(entry)}
                              label="Notify"
                            />
                          ) : null}
                          {member.status !== "canceled" ? (
                            <form action={archiveMemberAction}>
                              <input name="memberId" type="hidden" value={member.id} />
                              <input name="redirectTo" type="hidden" value="/dashboard/members" />
                              <ServerActionButton
                                className="px-0 py-0 text-sm font-normal"
                                idleLabel="Archive"
                                pendingLabel="Archiving..."
                                variant="ghost"
                              />
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filteredMembers.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm text-muted">
            <p>
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-3">
              {currentPage > 1 ? (
                <Link className="text-foreground" href={pageHref(currentPage - 1)}>
                  Previous
                </Link>
              ) : (
                <span className="opacity-50">Previous</span>
              )}
              {currentPage < totalPages ? (
                <Link className="text-foreground" href={pageHref(currentPage + 1)}>
                  Next
                </Link>
              ) : (
                <span className="opacity-50">Next</span>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function isRiskFilter(value: string | undefined): value is RiskFilter {
  return riskFilters.some((riskFilter) => riskFilter.value === value);
}

function buildMemberRiskTags({
  member,
  subscription,
  daysSinceLastVisit,
  openTaskCount,
  highPriorityTaskCount,
  insightCount
}: {
  member: MemberLite;
  subscription: SubscriptionLite | null;
  daysSinceLastVisit: number | null;
  openTaskCount: number;
  highPriorityTaskCount: number;
  insightCount: number;
}) {
  const tags: MemberRiskTag[] = [];
  const hasActiveSubscription = Boolean(subscription && subscription.status !== "canceled");

  if (member.status === "frozen") {
    tags.push({
      key: "frozen",
      label: "Frozen",
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-200"
    });
  }

  if (subscription?.status === "past_due") {
    tags.push({
      key: "billing",
      label: "Past due",
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-200"
    });
  }

  if (!hasActiveSubscription && member.status !== "lead" && member.status !== "canceled") {
    tags.push({
      key: "no_plan",
      label: "No plan",
      tone: "border-orange-500/30 bg-orange-500/10 text-orange-200"
    });
  }

  if (
    hasActiveSubscription &&
    !member.stripe_default_payment_method_id &&
    member.status !== "lead" &&
    member.status !== "canceled"
  ) {
    tags.push({
      key: "no_card",
      label: "Missing card",
      tone: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
    });
  }

  if ((daysSinceLastVisit ?? 999) >= 14 && member.status !== "lead" && member.status !== "canceled") {
    tags.push({
      key: "no_visit",
      label: "No recent visit",
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-200"
    });
  }

  if (openTaskCount > 0 || highPriorityTaskCount > 0 || insightCount > 0) {
    tags.push({
      key: "tasks",
      label:
        highPriorityTaskCount > 0 ? "Priority task" : openTaskCount > 0 ? "Open task" : "AI insight",
      tone: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200"
    });
  }

  return tags;
}

function matchesRiskFilter(entry: EnrichedMember, riskFilter: RiskFilter) {
  if (riskFilter === "all") {
    return true;
  }

  if (riskFilter === "needs_attention") {
    return entry.riskTags.length > 0;
  }

  return entry.riskTags.some((tag) => tag.key === riskFilter);
}

function formatLastVisitLabel(lastCheckInAt: string | null, daysSinceLastVisit: number | null) {
  if (!lastCheckInAt || daysSinceLastVisit === null) {
    return "Never checked in";
  }

  if (daysSinceLastVisit === 0) {
    return "Visited today";
  }

  if (daysSinceLastVisit === 1) {
    return "Visited yesterday";
  }

  return `${daysSinceLastVisit} days ago`;
}

function formatSubscriptionStatus(subscription: SubscriptionLite | null, member: MemberLite) {
  if (!subscription) {
    return member.status === "lead" ? "Lead record only" : "No billing plan assigned";
  }

  const billingInterval = toOneRelation(subscription.membership_plans)?.billing_interval ?? null;
  const cycleLabel = billingInterval ? `${billingInterval} billing` : "Billing cycle not set";

  if (subscription.status === "past_due") {
    return `Past due - ${cycleLabel}`;
  }

  if (subscription.status === "canceled") {
    return "Canceled subscription";
  }

  if (subscription.current_period_end) {
    return `Renews ${subscription.current_period_end} - ${cycleLabel}`;
  }

  return cycleLabel;
}

function buildDefaultTaskTitle(entry: EnrichedMember) {
  const tagKeys = new Set(entry.riskTags.map((tag) => tag.key));

  if (tagKeys.has("billing") || tagKeys.has("no_card")) {
    return "Resolve member billing issue";
  }

  if (tagKeys.has("no_visit")) {
    return "Attendance recovery follow-up";
  }

  if (tagKeys.has("frozen")) {
    return "Frozen membership follow-up";
  }

  if (tagKeys.has("no_plan")) {
    return "Assign membership plan";
  }

  return "General member follow-up";
}

function buildDefaultTaskDetails(entry: EnrichedMember) {
  const reasons = entry.riskTags.map((tag) => tag.label.toLowerCase());

  if (reasons.length === 0) {
    return "Created from the member roster for general staff follow-up.";
  }

  return `Created from the member roster because this member is flagged for ${reasons.join(", ")}.`;
}

function buildDefaultTaskType(entry: EnrichedMember) {
  const tagKeys = new Set(entry.riskTags.map((tag) => tag.key));

  if (tagKeys.has("billing") || tagKeys.has("no_card") || tagKeys.has("no_plan")) {
    return "billing";
  }

  if (tagKeys.has("no_visit") || tagKeys.has("frozen")) {
    return "retention";
  }

  return "general";
}

function buildDefaultNotificationTitle(entry: EnrichedMember) {
  const tagKeys = new Set(entry.riskTags.map((tag) => tag.key));

  if (tagKeys.has("billing") || tagKeys.has("no_card")) {
    return "Your membership payment needs attention";
  }

  if (tagKeys.has("no_visit")) {
    return "We miss seeing you at the gym";
  }

  if (tagKeys.has("frozen")) {
    return "Your membership is currently frozen";
  }

  if (tagKeys.has("no_plan")) {
    return "We are finalizing your membership setup";
  }

  return "Quick update from the gym";
}

function buildDefaultNotificationBody(entry: EnrichedMember) {
  const firstName = entry.member.first_name;
  const tagKeys = new Set(entry.riskTags.map((tag) => tag.key));

  if (tagKeys.has("billing") || tagKeys.has("no_card")) {
    return `Hi ${firstName}, there is a billing issue on your account right now. Please reply or stop by so we can help get it resolved.`;
  }

  if (tagKeys.has("no_visit")) {
    return `Hi ${firstName}, we noticed you have not been in recently and wanted to check in. Let us know if you need help getting back into a routine.`;
  }

  if (tagKeys.has("frozen")) {
    return `Hi ${firstName}, your membership is currently frozen${entry.member.frozen_until ? ` until ${entry.member.frozen_until}` : ""}. Reach out if you want help resuming it.`;
  }

  if (tagKeys.has("no_plan")) {
    return `Hi ${firstName}, we are still finalizing your membership setup and will help you get the right plan assigned.`;
  }

  return `Hi ${firstName}, we wanted to send you a quick update from the gym.`;
}

function buildDefaultNotificationType(entry: EnrichedMember) {
  const tagKeys = new Set(entry.riskTags.map((tag) => tag.key));

  if (tagKeys.has("billing") || tagKeys.has("no_card") || tagKeys.has("no_plan") || tagKeys.has("frozen")) {
    return "billing" as const;
  }

  if (tagKeys.has("no_visit")) {
    return "retention" as const;
  }

  return "general" as const;
}

function formatRelativeNotification(createdAt: string) {
  const daysAgo = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));

  if (daysAgo <= 0) {
    return "today";
  }

  if (daysAgo === 1) {
    return "yesterday";
  }

  return `${daysAgo} days ago`;
}
