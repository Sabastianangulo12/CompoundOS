import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberForm } from "@/components/members/member-form";
import { createMemberAction } from "@/app/(dashboard)/dashboard/members/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  getCachedMembershipPlans,
  getCachedMemberSignupDefaults
} from "@/lib/member-intake";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NewMemberPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function NewMemberPage({
  searchParams
}: NewMemberPageProps) {
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

  const [gymResult, plansResult] = await Promise.all([
    getCachedMemberSignupDefaults(currentGym.data.membership.gymId),
    getCachedMembershipPlans(currentGym.data.membership.gymId)
  ]);

  if (gymResult.error) {
    throw new Error(gymResult.error.message);
  }
  if (plansResult.error) {
    throw new Error(plansResult.error.message);
  }

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Members"
        title="Add a new member"
        description="Create a member record for the current gym without exposing tenant fields to the client."
      />
      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}
      <MemberForm
        action={createMemberAction}
        submitLabel="Create member"
        pendingLabel="Creating member..."
        defaultValues={{
          joinedAt: new Date().toISOString().slice(0, 10),
          waiverRequired: gymResult.data.require_waiver_on_signup,
          waiverTitle: gymResult.data.default_waiver_title,
          waiverBody: gymResult.data.default_waiver_body,
          waiverSignedAt:
            gymResult.data.require_waiver_on_signup &&
            gymResult.data.default_waiver_title &&
            gymResult.data.default_waiver_body
              ? new Date().toISOString().slice(0, 10)
              : null
        }}
        membershipPlans={(plansResult.data ?? []).map((plan) => ({
          id: plan.id,
          name: plan.name,
          priceCents: plan.price_cents,
          billingInterval: plan.billing_interval
        }))}
      />
    </section>
  );
}
