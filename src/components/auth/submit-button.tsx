"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function SubmitButton({
  idleLabel,
  pendingLabel
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-70"
      type="submit"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
