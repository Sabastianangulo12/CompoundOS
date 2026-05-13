"use client";

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-accent">Dashboard error</p>
      <h1 className="mt-3 text-2xl font-semibold">Something needs attention</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {error.message || "A dashboard request failed. Retry once the environment and data are ready."}
      </p>
      <button
        className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
