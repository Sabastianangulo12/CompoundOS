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
    <article className="panel p-5">
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </article>
  );
}

