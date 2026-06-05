function LoadingBlock({
  className = "h-12"
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-border bg-black/20 ${className}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="panel flex flex-col gap-4 p-4">
            <LoadingBlock className="h-6 w-32" />
            <LoadingBlock className="h-10 w-full" />
            <LoadingBlock className="h-24 w-full" />
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <LoadingBlock key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </aside>
        <main className="flex-1 space-y-6">
          <section className="panel space-y-4 p-6">
            <LoadingBlock className="h-4 w-28" />
            <LoadingBlock className="h-10 w-72 max-w-full" />
            <LoadingBlock className="h-5 w-full max-w-2xl" />
          </section>
          <section className="grid gap-6 xl:grid-cols-2">
            <LoadingBlock className="h-72 w-full" />
            <LoadingBlock className="h-72 w-full" />
            <LoadingBlock className="h-72 w-full" />
            <LoadingBlock className="h-96 w-full xl:col-span-2" />
          </section>
        </main>
      </div>
    </div>
  );
}
