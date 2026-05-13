import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { MemberForm } from "@/components/members/member-form";
import { createMemberAction } from "@/app/(dashboard)/dashboard/members/actions";

type NewMemberPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function NewMemberPage({
  searchParams
}: NewMemberPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Members"
        title="Add a new member"
        description="Create a member record for the current gym without exposing tenant fields to the client."
      />
      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}
      <MemberForm
        action={createMemberAction}
        submitLabel="Create member"
        pendingLabel="Creating member..."
      />
    </section>
  );
}

