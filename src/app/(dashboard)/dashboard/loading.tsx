export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="panel p-6">
        <div className="h-3 w-28 rounded-full bg-white/10" />
        <div className="mt-4 h-10 w-72 rounded-full bg-white/10" />
        <div className="mt-4 h-4 w-full max-w-2xl rounded-full bg-white/10" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="panel p-6">
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="mt-4 h-9 w-20 rounded-full bg-white/10" />
            <div className="mt-4 h-4 w-full rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
