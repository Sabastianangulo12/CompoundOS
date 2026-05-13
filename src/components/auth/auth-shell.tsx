import type { ReactNode } from "react";
import Link from "next/link";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  footerText: string;
  footerHref: string;
  footerLinkLabel: string;
  children: ReactNode;
  message?: string;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  footerText,
  footerHref,
  footerLinkLabel,
  children,
  message
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="panel w-full max-w-md p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted">{description}</p>
        {message ? (
          <div className="mt-6 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
            {message}
          </div>
        ) : null}
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-sm text-muted">
          {footerText}{" "}
          <Link className="text-foreground" href={footerHref}>
            {footerLinkLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}

