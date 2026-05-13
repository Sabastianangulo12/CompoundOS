import { redirect } from "next/navigation";
import { createGymAction } from "@/app/onboarding/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveGymMembership } from "@/lib/gym-users";

type CreateGymPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function CreateGymPage({
  searchParams
}: CreateGymPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await getActiveGymMembership(supabase, user.id);

  if (membership.error) {
    redirect(`/login?message=${encodeURIComponent(membership.error.message)}`);
  }

  if (membership.data) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="panel w-full max-w-lg p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-accent">
          First-run onboarding
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Create your gym workspace</h1>
        <p className="mt-3 text-sm text-muted">
          Set up the first tenant for this owner account. We&apos;ll create the
          gym and attach you as its owner.
        </p>
        {resolvedSearchParams?.message ? (
          <div className="mt-6 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
            {resolvedSearchParams.message}
          </div>
        ) : null}
        <form action={createGymAction} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="gymName">
              Gym name
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="gymName"
              name="gymName"
              placeholder="The Compound Lifting Club"
              type="text"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="slug">
              Slug
            </label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
              id="slug"
              name="slug"
              placeholder="compound-lifting-club"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
            <p className="mt-2 text-xs text-muted">
              Lowercase letters, numbers, and dashes work best.
            </p>
          </div>
          <SubmitButton
            idleLabel="Create gym"
            pendingLabel="Creating gym..."
          />
        </form>
      </section>
    </main>
  );
}
