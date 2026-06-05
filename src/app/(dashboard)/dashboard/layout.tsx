import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentGymContext } from "@/lib/gym-users";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardRuntimeGuard } from "@/components/dashboard/runtime-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (currentGym.error) {
    redirect(`/login?message=${encodeURIComponent(currentGym.error.message)}`);
  }

  if (!currentGym.data) {
    redirect("/onboarding/create-gym");
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardRuntimeGuard />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:px-8">
        <DashboardSidebar
          userEmail={currentGym.data.user.email ?? "Owner"}
          gymName={currentGym.data.membership.gymName}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
