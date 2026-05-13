import type { MemberStatus } from "@/lib/members";

const statusClasses: Record<MemberStatus, string> = {
  lead: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  frozen: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  canceled: "border-zinc-500/30 bg-zinc-500/20 text-zinc-300"
};

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
        statusClasses[status]
      ].join(" ")}
    >
      {status}
    </span>
  );
}

