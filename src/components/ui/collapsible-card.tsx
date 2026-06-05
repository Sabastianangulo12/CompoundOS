"use client";

import { useState } from "react";

type CollapsibleCardProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  description: string;
  eyebrow: string;
  title: string;
};

export function CollapsibleCard({
  children,
  defaultOpen = false,
  description,
  eyebrow,
  title
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
        isOpen
          ? "border-foreground/20 bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
          : "border-border bg-card"
      }`}
    >
      <button
        aria-expanded={isOpen}
        className={`flex w-full items-start justify-between gap-4 px-6 py-6 text-left transition-colors duration-200 ${
          isOpen ? "bg-white/[0.03]" : "bg-transparent"
        }`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
          <h2 className="mt-2 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <span
          className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-black/20 text-muted transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          v
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`border-t px-6 transition-all duration-200 ${
              isOpen
                ? "border-border py-4 opacity-100"
                : "border-transparent py-0 opacity-0"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
