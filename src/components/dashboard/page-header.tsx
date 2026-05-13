type DashboardPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description
}: DashboardPageHeaderProps) {
  return (
    <header className="panel p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">{description}</p>
    </header>
  );
}

