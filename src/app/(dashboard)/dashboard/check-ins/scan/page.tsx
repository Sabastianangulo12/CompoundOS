import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { createQrCheckInAction } from "@/app/(dashboard)/dashboard/check-ins/actions";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getRecentCheckInsForGym } from "@/lib/check-ins";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CheckInScanPageProps = {
  searchParams?: Promise<{
    message?: string;
    qrValue?: string;
  }>;
};

export default async function CheckInScanPage({
  searchParams
}: CheckInScanPageProps) {
  const resolvedSearchParams = await searchParams;
  const qrValue = resolvedSearchParams?.qrValue?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const recentCheckInsResult = await getRecentCheckInsForGym(
    supabase,
    currentGym.data.membership.gymId,
    12
  );

  if (recentCheckInsResult.error) {
    throw new Error(recentCheckInsResult.error.message);
  }

  const recentQrCheckIns = recentCheckInsResult.data.filter(
    (checkIn) => checkIn.check_in_method === "qr"
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <DashboardPageHeader
          eyebrow="QR check-ins"
          title="Scan member QR"
          description={`Simulate a front-desk scan for ${currentGym.data.membership.gymName}. Paste a member QR payload from the mobile app to record a gym-scoped check-in.`}
        />
        <Link
          className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium"
          href="/dashboard/check-ins"
        >
          Back to check-ins
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Simulated scan input</h2>
          <p className="mt-2 text-sm text-muted">
            Use the member app QR value for now. Structured QR payloads and legacy member IDs are both accepted, but the server will only allow members in the current gym.
          </p>

          {resolvedSearchParams?.message ? (
            <div className="mt-4 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
              {resolvedSearchParams.message}
            </div>
          ) : null}

          <form action={createQrCheckInAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-muted" htmlFor="qrValue">
                Member QR value
              </label>
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={qrValue}
                id="qrValue"
                name="qrValue"
                placeholder="Paste QR payload from the member app"
                required
              />
              <p className="mt-2 text-xs text-muted">
                No camera integration yet. This input simulates the front-desk scan result.
              </p>
            </div>
            <button
              className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black"
              type="submit"
            >
              Record QR check-in
            </button>
          </form>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Recent QR check-ins</h2>
            <p className="mt-1 text-sm text-muted">
              The latest QR-based arrivals recorded for this gym.
            </p>
          </div>
          {recentQrCheckIns.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-lg font-medium">No QR check-ins yet</p>
              <p className="mt-2 text-sm text-muted">
                QR arrivals will appear here once scanned.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentQrCheckIns.map((checkIn) => (
                <div
                  key={checkIn.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {checkIn.members?.first_name} {checkIn.members?.last_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {checkIn.members?.email ?? "No email on file"}
                    </p>
                  </div>
                  <div className="text-sm text-muted sm:text-right">
                    <p className="capitalize">{checkIn.check_in_method}</p>
                    <p className="mt-1">
                      {new Date(checkIn.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: currentGym.data.membership.gymTimezone
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
