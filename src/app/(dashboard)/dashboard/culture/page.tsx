import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  archiveShoutoutAction,
  archiveSpotlightAction,
  createShoutoutAction,
  createSpotlightAction,
  toggleShoutoutPinAction
} from "@/app/(dashboard)/dashboard/culture/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CulturePageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function CulturePage({ searchParams }: CulturePageProps) {
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

  const [membersResult, shoutoutsResult, spotlightsResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("gym_id", currentGym.data.membership.gymId)
      .neq("status", "canceled")
      .order("first_name", { ascending: true })
      .limit(120),
    supabase
      .from("gym_shoutouts")
      .select(
        `
          *,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("gym_member_spotlights")
      .select(
        `
          *,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  if (membersResult.error) throw new Error(membersResult.error.message);
  if (shoutoutsResult.error) throw new Error(shoutoutsResult.error.message);
  if (spotlightsResult.error) throw new Error(spotlightsResult.error.message);

  const members = membersResult.data ?? [];
  const memberOptions = members.slice(0, 120);
  const shoutouts = shoutoutsResult.data ?? [];
  const spotlights = spotlightsResult.data ?? [];
  const activeSpotlights = spotlights.filter((spotlight) => spotlight.status === "active");

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Culture"
        title="Gym culture OS"
        description={`Run shoutouts, member spotlights, and recognition loops for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="Active spotlights"
          value={String(activeSpotlights.length)}
          description="Member stories currently visible in the app."
        />
        <PlaceholderCard
          title="Recent shoutouts"
          value={String(shoutouts.length)}
          description="Recognition posts and pinned gym moments."
        />
        <PlaceholderCard
          title="Eligible members"
          value={String(members.length)}
          description="Members available for recognition and spotlighting."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Post shoutout</h2>
            <p className="mt-1 text-sm text-muted">
              Create recognition moments and operational announcements with a warmer tone.
            </p>
          </div>
          <div className="p-6">
            <form action={createShoutoutAction} className="grid gap-4">
              <select
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="memberId"
                defaultValue=""
              >
                <option value="">Optional member</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="title"
                placeholder="Big win this week"
                required
              />
              <textarea
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="body"
                placeholder="Write the shoutout"
                rows={4}
                required
              />
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="expiresAt"
                type="datetime-local"
              />
              <label className="flex items-center gap-3 text-sm text-muted">
                <input name="isPinned" type="checkbox" />
                Pin this shoutout
              </label>
              <label className="flex items-center gap-3 text-sm text-muted">
                <input name="notifyMembers" type="checkbox" />
                Send this shoutout as a member notification
              </label>
              <ServerActionButton
                idleLabel="Publish shoutout"
                pendingLabel="Publishing..."
              />
            </form>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Create spotlight</h2>
            <p className="mt-1 text-sm text-muted">
              Feature one member at a time with a story that shows up in the member experience.
            </p>
          </div>
          <div className="p-6">
            <form action={createSpotlightAction} className="grid gap-4">
              <select
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="memberId"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select member
                </option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="title"
                placeholder="Member of the month"
                required
              />
              <textarea
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="body"
                placeholder="Why this member is being featured"
                rows={4}
                required
              />
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="imageUrl"
                placeholder="Optional image URL"
              />
              <label className="flex items-center gap-3 text-sm text-muted">
                <input name="notifyMember" type="checkbox" />
                Notify the spotlighted member
              </label>
              <ServerActionButton
                idleLabel="Create spotlight"
                pendingLabel="Creating..."
              />
            </form>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Recent shoutouts</h2>
          </div>
          <div className="divide-y divide-border">
            {shoutouts.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No shoutouts yet.</div>
            ) : (
              shoutouts.map((shoutout) => (
                <div key={shoutout.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{shoutout.title}</p>
                    {shoutout.is_pinned ? (
                      <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                        pinned
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{shoutout.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {(shoutout.members as { first_name: string; last_name: string } | null)
                      ? `${(shoutout.members as { first_name: string; last_name: string }).first_name} ${(shoutout.members as { first_name: string; last_name: string }).last_name}`
                      : "Gym-wide"}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <form action={toggleShoutoutPinAction}>
                      <input name="shoutoutId" type="hidden" value={shoutout.id} />
                      <input
                        name="nextPinned"
                        type="hidden"
                        value={shoutout.is_pinned ? "false" : "true"}
                      />
                      <ServerActionButton
                        idleLabel={shoutout.is_pinned ? "Unpin" : "Pin"}
                        pendingLabel="Saving..."
                        variant="ghost"
                        className="px-0 py-0"
                      />
                    </form>
                    <form action={archiveShoutoutAction}>
                      <input name="shoutoutId" type="hidden" value={shoutout.id} />
                      <ServerActionButton
                        idleLabel="Archive"
                        pendingLabel="Archiving..."
                        variant="ghost"
                        className="px-0 py-0"
                      />
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Member spotlights</h2>
          </div>
          <div className="divide-y divide-border">
            {spotlights.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No member spotlights yet.</div>
            ) : (
              spotlights.map((spotlight) => {
                const member = spotlight.members as { first_name: string; last_name: string } | null;
                return (
                  <div
                    key={spotlight.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div>
                      <p className="font-medium">{spotlight.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {member ? `${member.first_name} ${member.last_name}` : "Unknown member"}
                      </p>
                      <p className="mt-2 text-sm text-muted">{spotlight.body}</p>
                    </div>
                    {spotlight.status === "active" ? (
                      <form action={archiveSpotlightAction}>
                        <input name="spotlightId" type="hidden" value={spotlight.id} />
                        <ServerActionButton
                          idleLabel="Archive"
                          pendingLabel="Archiving..."
                          variant="secondary"
                        />
                      </form>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.18em] text-muted">
                        archived
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
