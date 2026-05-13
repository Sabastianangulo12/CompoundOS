import { DashboardPageHeader } from "@/components/dashboard/page-header";

export default function RetentionPage() {
  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Retention"
        title="Retention analytics"
        description="Placeholder for churn, cohorts, and win-back insights."
      />
      <div className="panel p-6 text-sm text-muted">
        Cohort views, churn signals, and renewal prompts will go here.
      </div>
    </section>
  );
}

