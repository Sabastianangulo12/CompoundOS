import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel max-w-3xl p-10">
        <p className="text-sm uppercase tracking-[0.24em] text-accent">
          The Compound Lifting Club OS
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Multi-tenant gym operations, starting with a clean owner dashboard.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted">
          This starter includes App Router, Tailwind CSS, TypeScript, Supabase
          plumbing, and the first dashboard routes for members, check-ins,
          revenue, retention, and the AI command center.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-black"
            href="/dashboard"
          >
            Open dashboard
          </Link>
          <Link
            className="rounded-full border border-border px-5 py-3 text-sm font-medium"
            href="/login"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

