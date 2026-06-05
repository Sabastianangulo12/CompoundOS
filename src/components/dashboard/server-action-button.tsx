"use client";

import { useFormStatus } from "react-dom";

type ServerActionButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
};

const baseClassName =
  "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

const variantClassNames: Record<NonNullable<ServerActionButtonProps["variant"]>, string> = {
  primary: "bg-accent text-black",
  secondary: "border border-border bg-black/20 text-foreground",
  ghost: "text-muted hover:text-foreground"
};

export function ServerActionButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  className,
  disabled = false
}: ServerActionButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      className={[baseClassName, variantClassNames[variant], className ?? ""].join(" ").trim()}
      disabled={isDisabled}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
