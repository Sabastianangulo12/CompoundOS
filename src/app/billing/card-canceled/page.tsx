type CardCanceledPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function CardCanceledPage({
  searchParams
}: CardCanceledPageProps) {
  const params = (await searchParams) ?? {};
  const message =
    typeof params.message === "string" && params.message.trim().length > 0
      ? params.message
      : "Card setup was canceled. Return to the member app when you're ready to try again.";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700">
          Billing
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">Card setup not completed</h1>
        <p className="text-base leading-7 text-slate-700">{message}</p>
      </div>
    </main>
  );
}
