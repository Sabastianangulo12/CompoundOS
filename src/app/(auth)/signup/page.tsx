import { redirect } from "next/navigation";
import { signupAction } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;

  return (
    <AuthShell
      eyebrow="Launch a location"
      title="Create your owner account"
      description="Start with a single owner profile and connect the rest of the tenant model after auth."
      footerText="Already have access?"
      footerHref="/login"
      footerLinkLabel="Sign in"
      message={resolvedSearchParams?.message}
    >
      <form action={signupAction} className="space-y-4">
        <input
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
          name="fullName"
          placeholder="Full name"
          type="text"
          autoComplete="name"
          required
        />
        <input
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
          name="gymName"
          placeholder="Gym name"
          type="text"
          required
        />
        <input
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
          name="email"
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
        />
        <input
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
          name="password"
          placeholder="Create a password"
          type="password"
          autoComplete="new-password"
          required
        />
        <SubmitButton
          idleLabel="Create account"
          pendingLabel="Creating account..."
        />
      </form>
    </AuthShell>
  );
}
