"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/members", label: "Members" },
  { href: "/dashboard/check-ins", label: "Check-ins" },
  { href: "/dashboard/revenue", label: "Revenue" },
  { href: "/dashboard/retention", label: "Retention" },
  { href: "/dashboard/ai-command-center", label: "AI Command Center" },
  { href: "/dashboard/automations", label: "Automations" }
];

type DashboardSidebarProps = {
  userEmail: string;
  gymName: string;
};

export function DashboardSidebar({
  userEmail,
  gymName
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-72">
      <div className="panel flex h-full flex-col p-4">
        <div className="border-b border-border px-3 pb-4">
          <p className="text-xs uppercase tracking-[0.24em] text-accent">
            The Compound
          </p>
          <h2 className="mt-2 text-lg font-semibold">Lifting Club OS</h2>
          <p className="mt-2 text-sm text-muted">
            Owner workspace for multi-tenant gym operations.
          </p>
          <div className="mt-4 rounded-2xl border border-border bg-black/20 px-3 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              Current gym
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{gymName}</p>
          </div>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block shrink-0 rounded-xl px-3 py-2 text-sm",
                  isActive
                    ? "bg-accent font-medium text-black"
                    : "text-muted hover:bg-white/5 hover:text-foreground"
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border px-3 pt-4">
          <p className="text-sm font-medium">{userEmail}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
            Owner session
          </p>
          <form action="/auth/logout" className="mt-4" method="post">
            <button
              className="w-full rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
              type="submit"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
