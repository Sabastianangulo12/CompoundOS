import { ServerActionButton } from "@/components/dashboard/server-action-button";
import { sendMemberNotificationAction } from "@/app/(dashboard)/dashboard/notifications/actions";

type MemberQuickNotifyFormProps = {
  memberId: string;
  redirectTo: string;
  title: string;
  body: string;
  type?: "general" | "retention" | "billing" | "workout";
  label?: string;
  className?: string;
};

export function MemberQuickNotifyForm({
  memberId,
  redirectTo,
  title,
  body,
  type = "general",
  label = "Notify",
  className = "px-0 py-0 text-sm font-normal"
}: MemberQuickNotifyFormProps) {
  return (
    <form action={sendMemberNotificationAction}>
      <input name="recipient" type="hidden" value={memberId} />
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <input name="title" type="hidden" value={title} />
      <input name="body" type="hidden" value={body} />
      <input name="type" type="hidden" value={type} />
      <ServerActionButton
        className={className}
        idleLabel={label}
        pendingLabel="Sending..."
        variant="ghost"
      />
    </form>
  );
}
