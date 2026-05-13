import { notFound, redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlanForm } from "@/components/revenue/plan-form";
import { updatePlanAction } from "@/app/(dashboard)/dashboard/revenue/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import {
  formatCurrencyFromCents,
  getMembershipPlanByIdForGym
} from "@/lib/revenue";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EditPlanPageProps = {
  params: Promise<{
    planId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function EditPlanPage({
  params,
  searchParams
}: EditPlanPageProps) {
  const { planId } = await params;
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

  const planResult = await getMembershipPlanByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    planId
  );

  if (planResult.error) {
    redirect(`/dashboard/revenue?message=${encodeURIComponent(planResult.error.message)}`);
  }

  if (!planResult.data) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Revenue"
        title={`Edit ${planResult.data.name}`}
        description="Update plan pricing and cadence for the current gym."
      />
      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}
      <PlanForm
        action={updatePlanAction}
        submitLabel="Save plan"
        pendingLabel="Saving..."
        defaultValues={{
          id: planResult.data.id,
          name: planResult.data.name,
          price: String(planResult.data.price_cents / 100),
          billingInterval: planResult.data.billing_interval
        }}
      />
      <div className="panel p-6 text-sm text-muted">
        Current price: {formatCurrencyFromCents(planResult.data.price_cents)} per{" "}
        {planResult.data.billing_interval}.
      </div>
    </section>
  );
}
