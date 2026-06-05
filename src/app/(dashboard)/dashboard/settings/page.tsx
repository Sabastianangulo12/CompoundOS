import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  addGymStaffMembershipByEmailAction,
  updateGymProfileAction,
  updateGymStaffMembershipAction
} from "@/app/(dashboard)/dashboard/settings/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SettingsPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

const roleOptions = ["owner", "manager", "coach", "staff"] as const;

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
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

  const [gymResult, staffMembershipsResult, profilesResult] = await Promise.all([
    supabase
      .from("gyms")
      .select("id, name, slug, timezone, stripe_onboarding_completed, stripe_charges_enabled, default_waiver_title, default_waiver_body, require_waiver_on_signup")
      .eq("id", currentGym.data.membership.gymId)
      .single(),
    supabase
      .from("gym_users")
      .select("id, user_id, role, is_active, created_at")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, email, full_name")
  ]);

  if (gymResult.error) throw new Error(gymResult.error.message);
  if (staffMembershipsResult.error) throw new Error(staffMembershipsResult.error.message);
  if (profilesResult.error) throw new Error(profilesResult.error.message);

  const gym = gymResult.data;
  const profilesById = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile])
  );
  const staffMemberships = (staffMembershipsResult.data ?? []).map((membership) => ({
    ...membership,
    profile: profilesById.get(membership.user_id) ?? null
  }));
  const activeStaffCount = staffMemberships.filter((membership) => membership.is_active).length;
  const ownerCount = staffMemberships.filter(
    (membership) => membership.is_active && membership.role === "owner"
  ).length;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Settings"
        title="Gym settings"
        description={`Manage gym profile details, staff roles, and access guardrails for ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard
          title="Active staff"
          value={String(activeStaffCount)}
          description="Gym users who currently have active dashboard access."
        />
        <PlaceholderCard
          title="Owners"
          value={String(ownerCount)}
          description="At least one active owner must remain on the gym."
        />
        <PlaceholderCard
          title="Stripe onboarding"
          value={gym.stripe_onboarding_completed ? "Submitted" : "Pending"}
          description="Whether the gym has finished Stripe onboarding."
        />
        <PlaceholderCard
          title="Charges"
          value={gym.stripe_charges_enabled ? "Enabled" : "Not ready"}
          description="Card charges stay blocked until Stripe enables them."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Gym profile</h2>
            <p className="mt-1 text-sm text-muted">
              Core gym identity settings used across the dashboard and member app.
            </p>
          </div>
          <div className="p-6">
            <form action={updateGymProfileAction} className="grid gap-4">
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="name"
                defaultValue={gym.name}
                placeholder="Gym name"
                required
              />
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="slug"
                defaultValue={gym.slug}
                placeholder="Gym slug"
                required
              />
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="timezone"
                defaultValue={gym.timezone}
                placeholder="Timezone"
                required
              />
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-black/10 px-4 py-3 text-sm text-foreground">
                <input
                  className="h-4 w-4 rounded border-border bg-black/20"
                  name="requireWaiverOnSignup"
                  type="checkbox"
                  value="true"
                  defaultChecked={gym.require_waiver_on_signup}
                />
                Require a signed waiver during new-member signup
              </label>
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="defaultWaiverTitle"
                defaultValue={gym.default_waiver_title ?? ""}
                placeholder="Default waiver title"
              />
              <textarea
                className="min-h-40 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="defaultWaiverBody"
                defaultValue={gym.default_waiver_body ?? ""}
                placeholder="Default waiver text shown in the new-member intake flow."
              />
              <ServerActionButton
                idleLabel="Save gym settings"
                pendingLabel="Saving..."
              />
            </form>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Add existing user to staff</h2>
            <p className="mt-1 text-sm text-muted">
              Grant dashboard access to someone who already created an account in the system.
            </p>
          </div>
          <div className="border-b border-border p-6">
            <form action={addGymStaffMembershipByEmailAction} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="email"
                placeholder="staff@example.com"
                required
                type="email"
              />
              <select
                className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none"
                name="role"
                defaultValue="staff"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <ServerActionButton
                idleLabel="Add access"
                pendingLabel="Adding..."
              />
            </form>
          </div>
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Staff access</h2>
            <p className="mt-1 text-sm text-muted">
              Role and access management for owners, managers, coaches, and staff.
            </p>
          </div>
          <div className="divide-y divide-border">
            {staffMemberships.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted">No gym staff memberships found.</div>
            ) : (
              staffMemberships.map((membership) => (
                <div
                  key={membership.id}
                  className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {membership.profile?.full_name ?? membership.profile?.email ?? membership.user_id}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {membership.profile?.email ?? "No email on profile"} |{" "}
                      {membership.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <form action={updateGymStaffMembershipAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="gymUserId" value={membership.id} />
                    <select
                      className="rounded-xl border border-border bg-black/20 px-3 py-2 text-sm outline-none"
                      name="role"
                      defaultValue={membership.role}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border border-border bg-black/20 px-3 py-2 text-sm outline-none"
                      name="isActive"
                      defaultValue={membership.is_active ? "true" : "false"}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                    <ServerActionButton
                      idleLabel="Update access"
                      pendingLabel="Saving..."
                      variant="secondary"
                    />
                  </form>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
