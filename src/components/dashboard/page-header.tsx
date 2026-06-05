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
    <header className="panel relative overflow-hidden p-6 md:p-7">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-accent/8 via-transparent to-transparent" />
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </div>
    </header>
  );
}
