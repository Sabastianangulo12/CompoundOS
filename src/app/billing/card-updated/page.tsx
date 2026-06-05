export default function CardUpdatedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Billing
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">Card saved</h1>
        <p className="text-base leading-7 text-slate-600">
          Your default card on file has been updated successfully. You can close this
          page and return to the member app.
        </p>
      </div>
    </main>
  );
}
