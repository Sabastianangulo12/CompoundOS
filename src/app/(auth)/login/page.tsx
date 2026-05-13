import { redirect } from "next/navigation";
import { loginAction } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
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
      eyebrow="Owner access"
      title="Sign in"
      description="Use your Supabase account to enter the owner dashboard."
      footerText="Need an account?"
      footerHref="/signup"
      footerLinkLabel="Create one"
      message={resolvedSearchParams?.message}
    >
      <form action={loginAction} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="email">
            Email
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none ring-0"
            id="email"
            name="email"
            placeholder="owner@compoundclub.com"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="password">
            Password
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none ring-0"
            id="password"
            name="password"
            placeholder="Enter your password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <SubmitButton idleLabel="Continue" pendingLabel="Signing in..." />
      </form>
    </AuthShell>
  );
}
