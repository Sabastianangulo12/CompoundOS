import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { sendMemberNotificationAction } from "@/app/(dashboard)/dashboard/notifications/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NotificationsPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

type MemberOption = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: "retention" | "workout" | "billing" | "general";
  status: "pending" | "sent" | "failed";
  created_at: string;
  read_at: string | null;
  members: Array<{
    id: string;
    first_name: string;
    last_name: string;
  }> | null;
};

const typeLabels: Record<NotificationRow["type"], string> = {
  retention: "Retention",
  workout: "Workout",
  billing: "Billing",
  general: "General"
};

const notificationTemplates = [
  {
    key: "billing-recovery",
    title: "Payment method needed",
    body:
      "Your membership billing needs attention. Please update your payment method or contact the front desk so we can help.",
    type: "billing" as const
  },
  {
    key: "freeze-ending",
    title: "Your freeze is ending soon",
    body:
      "Your membership freeze is ending soon. Resume your membership before the freeze window ends to avoid cancellation.",
    type: "billing" as const
  },
  {
    key: "attendance-nudge",
    title: "We miss seeing you at the gym",
    body:
      "We noticed you have not been in recently and wanted to check in. Let us know if you need help getting back into a routine.",
    type: "retention" as const
  },
  {
    key: "community-update",
    title: "New gym update",
    body:
      "There is a new update from the gym waiting for you in the app. Open the member app to catch up on the latest news.",
    type: "general" as const
  }
] as const;

export default async function NotificationsPage({
  searchParams
}: NotificationsPageProps) {
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

  const gymId = currentGym.data.membership.gymId;

  const [membersResult, notificationsResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, status")
      .eq("gym_id", gymId)
      .neq("status", "canceled")
      .order("first_name", { ascending: true })
      .limit(120),
    supabase
      .from("notifications")
      .select(
        `
          id,
          title,
          body,
          type,
          status,
          created_at,
          read_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false })
      .limit(40)
  ]);

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }

  if (notificationsResult.error) {
    throw new Error(notificationsResult.error.message);
  }

  const members = (membersResult.data ?? []) as MemberOption[];
  const notifications = (notificationsResult.data ?? []) as NotificationRow[];
  const recipientOptions = members.slice(0, 120);
  const sentCount = notifications.filter((notification) => notification.status === "sent").length;
  const failedCount = notifications.filter((notification) => notification.status === "failed").length;
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const billingCount = notifications.filter(
    (notification) => notification.type === "billing"
  ).length;
  const retentionCount = notifications.filter(
    (notification) => notification.type === "retention"
  ).length;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Notifications"
        title="Member messaging"
        description={`Send targeted or broadcast updates to members in ${currentGym.data.membership.gymName} and review delivery history.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Recent notifications"
          value={String(notifications.length)}
          description="Most recent message records in this gym."
        />
        <PlaceholderCard
          title="Sent"
          value={String(sentCount)}
          description="Notifications that were marked sent."
        />
        <PlaceholderCard
          title="Failed"
          value={String(failedCount)}
          description="Notifications that could not be delivered."
        />
        <PlaceholderCard
          title="Retention + billing"
          value={String(retentionCount + billingCount)}
          description="Recent lifecycle messages tied to retention or billing."
        />
        <PlaceholderCard
          title="Unread"
          value={String(unreadCount)}
          description="Messages still unread in the member app inbox."
        />
      </div>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Send notification</h2>
        <p className="mt-1 text-sm text-muted">
          Use this for member follow-up, account reminders, training nudges, or operational announcements.
        </p>

        <form action={sendMemberNotificationAction} className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm text-muted" htmlFor="recipient">
              Recipient
            </label>
            <select
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="recipient"
              name="recipient"
              defaultValue="all_active"
            >
              <option value="all_active">All active + frozen members</option>
              {recipientOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.first_name} {member.last_name} · {member.status}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Broadcast reaches every active and frozen member. Direct-send keeps the
              first 120 member options loaded for speed; use a member profile for a
              one-off message deeper in the roster.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="type">
              Type
            </label>
            <select
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="type"
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
            <label className="mb-2 block text-sm text-muted" htmlFor="title">
              Title
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="title"
              name="title"
              placeholder="Membership reminder"
              required
            />
          </div>

          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm text-muted" htmlFor="body">
              Message
            </label>
            <textarea
              className="min-h-32 w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="body"
              name="body"
              placeholder="Add the message you want members to receive."
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
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Quick templates</h2>
          <p className="mt-1 text-sm text-muted">
            Reuse common billing and retention messages without rewriting them every time.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 xl:grid-cols-2">
          {notificationTemplates.map((template) => (
            <div
              key={template.key}
              className="rounded-2xl border border-border bg-black/20 p-4"
            >
              <p className="font-medium">{template.title}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                {typeLabels[template.type]}
              </p>
              <p className="mt-3 text-sm text-muted">{template.body}</p>
              <form action={sendMemberNotificationAction} className="mt-4">
                <input name="recipient" type="hidden" value="all_active" />
                <input name="redirectTo" type="hidden" value="/dashboard/notifications" />
                <input name="type" type="hidden" value={template.type} />
                <input name="title" type="hidden" value={template.title} />
                <input name="body" type="hidden" value={template.body} />
                <ServerActionButton
                  idleLabel="Send to all active + frozen"
                  pendingLabel="Sending..."
                  variant="secondary"
                />
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Recent delivery history</h2>
          <p className="mt-1 text-sm text-muted">
            Review who received what, which category it came from, and whether delivery succeeded.
          </p>
        </div>
        <div className="divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">No notifications have been sent yet.</div>
          ) : (
            notifications.map((notification) => {
              const member = toOneRelation(notification.members);

              return (
                <div
                  key={notification.id}
                  className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{notification.title}</p>
                      <span className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {typeLabels[notification.type]}
                      </span>
                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
                          notification.status === "sent"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : notification.status === "failed"
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                        ].join(" ")}
                      >
                        {notification.status}
                      </span>
                      <span className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        {notification.read_at ? "read" : "unread"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{notification.body}</p>
                    <p className="mt-2 text-sm text-muted">
                      {member
                        ? `${member.first_name} ${member.last_name}`
                        : "Broadcast or member record unavailable"}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {new Date(notification.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                    {notification.read_at
                      ? ` | opened ${new Date(notification.read_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: currentGym.data.membership.gymTimezone
                        })}`
                      : ""}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}
