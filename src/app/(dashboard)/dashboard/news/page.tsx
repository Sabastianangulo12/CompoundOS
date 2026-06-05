import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  createAnnouncementAction,
  updateAnnouncementAction
} from "@/app/(dashboard)/dashboard/news/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getGymAnnouncements } from "@/lib/news";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NewsPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function NewsPage({ searchParams }: NewsPageProps) {
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

  const announcementsResult = await getGymAnnouncements(
    supabase,
    currentGym.data.membership.gymId,
    24
  );

  if (announcementsResult.error) {
    throw new Error(announcementsResult.error.message);
  }

  const announcements = announcementsResult.data ?? [];
  const pinnedCount = announcements.filter((announcement) => announcement.is_pinned).length;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Gym news"
        title="Post updates for every member"
        description={`Share memos, schedule changes, and club notes for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="Active posts"
          value={String(announcements.length)}
          description="Announcements visible to current members."
        />
        <PlaceholderCard
          title="Pinned"
          value={String(pinnedCount)}
          description="Posts held to the top of the member news card."
        />
        <PlaceholderCard
          title="Audience"
          value="All members"
          description="Every linked member in this gym can read these updates."
        />
      </div>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">New announcement</h2>
        <p className="mt-2 text-sm text-muted">
          Keep it short, useful, and member-facing.
        </p>
        <form action={createAnnouncementAction} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="title">
              Title
            </label>
            <input
              className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
              id="title"
              name="title"
              placeholder="Holiday schedule update"
              required
              type="text"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="body">
              Message
            </label>
            <textarea
              className="min-h-32 w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
              id="body"
              name="body"
              placeholder="We are opening at 8am on Monday and moving the noon class to 1pm."
              required
            />
          </div>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input className="h-4 w-4 accent-[var(--accent)]" name="isPinned" type="checkbox" />
            Pin this to the top for members
          </label>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input className="h-4 w-4 accent-[var(--accent)]" name="notifyMembers" type="checkbox" />
            Send this as a member notification too
          </label>
          <ServerActionButton
            idleLabel="Post announcement"
            pendingLabel="Posting..."
          />
        </form>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Live member feed</h2>
          <p className="mt-1 text-sm text-muted">
            These posts render in the member app Home tab.
          </p>
        </div>
        <div className="divide-y divide-border">
          {announcements.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted">
              No news posted yet.
            </div>
          ) : (
            announcements.map((announcement) => (
              <article
                key={announcement.id}
                className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-start xl:justify-between"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{announcement.title}</h3>
                    {announcement.is_pinned ? (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                        Pinned
                      </span>
                    ) : null}
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-muted">
                    {announcement.body}
                  </p>
                  <p className="text-sm text-muted">
                    {new Date(announcement.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: currentGym.data.membership.gymTimezone
                    })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <form action={updateAnnouncementAction}>
                    <input
                      name="announcementId"
                      type="hidden"
                      value={announcement.id}
                    />
                    <input
                      name="intent"
                      type="hidden"
                      value={announcement.is_pinned ? "unpin" : "pin"}
                    />
                    <ServerActionButton
                      idleLabel={announcement.is_pinned ? "Unpin" : "Pin"}
                      pendingLabel="Saving..."
                      variant="secondary"
                    />
                  </form>
                  <form action={updateAnnouncementAction}>
                    <input
                      name="announcementId"
                      type="hidden"
                      value={announcement.id}
                    />
                    <input name="intent" type="hidden" value="archive" />
                    <ServerActionButton
                      idleLabel="Archive"
                      pendingLabel="Archiving..."
                      variant="secondary"
                    />
                  </form>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
