import type { MemberStatus } from "@/lib/members";
import { memberStatuses } from "@/lib/members";
import { SubmitButton } from "@/components/auth/submit-button";

type MemberFormValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  status?: MemberStatus;
  joinedAt?: string | null;
};

type MemberFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  defaultValues?: MemberFormValues;
};

export function MemberForm({
  action,
  submitLabel,
  pendingLabel,
  defaultValues
}: MemberFormProps) {
  return (
    <form action={action} className="panel p-6">
      {defaultValues?.id ? (
        <input type="hidden" name="memberId" value={defaultValues.id} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="firstName">
            First name
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="firstName"
            name="firstName"
            defaultValue={defaultValues?.firstName ?? ""}
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="lastName">
            Last name
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="lastName"
            name="lastName"
            defaultValue={defaultValues?.lastName ?? ""}
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="email">
            Email
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="phone">
            Phone
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="phone"
            name="phone"
            defaultValue={defaultValues?.phone ?? ""}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="status">
            Status
          </label>
          <select
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "lead"}
          >
            {memberStatuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="joinedAt">
            Joined at
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="joinedAt"
            name="joinedAt"
            type="date"
            defaultValue={defaultValues?.joinedAt ?? ""}
          />
        </div>
      </div>
      <div className="mt-6 max-w-40">
        <SubmitButton idleLabel={submitLabel} pendingLabel={pendingLabel} />
      </div>
    </form>
  );
}
