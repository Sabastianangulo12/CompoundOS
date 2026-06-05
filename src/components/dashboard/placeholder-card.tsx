type PlaceholderCardProps = {
  title: string;
  value: string;
  description: string;
};

export function PlaceholderCard({
  title,
  value,
  description
}: PlaceholderCardProps) {
  return (
    <article className="panel relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{title}</p>
        <span className="rounded-full border border-border bg-panel-elevated px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted">
          Live
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 max-w-[26ch] text-sm leading-6 text-muted">{description}</p>
    </article>
  );
}
