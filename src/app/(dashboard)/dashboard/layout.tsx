import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getActiveGymMembership } from "@/lib/gym-users";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    redirect(`/login?message=${encodeURIComponent(userError.message)}`);
  }

  if (!user) {
    redirect("/login");
  }

  const membership = await getActiveGymMembership(supabase, user.id);

  if (membership.error) {
    redirect(
      `/login?message=${encodeURIComponent(membership.error.message)}`
    );
  }

  if (!membership.data) {
    redirect("/onboarding/create-gym");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:px-8">
        <DashboardSidebar
          userEmail={user.email ?? "Owner"}
          gymName={membership.data.gymName}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
