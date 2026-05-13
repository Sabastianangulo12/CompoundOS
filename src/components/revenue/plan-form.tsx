import { SubmitButton } from "@/components/auth/submit-button";
import { billingIntervals, type BillingInterval } from "@/lib/revenue";

type PlanFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  defaultValues?: {
    id?: string;
    name?: string;
    price?: string;
    billingInterval?: BillingInterval;
  };
};

export function PlanForm({
  action,
  submitLabel,
  pendingLabel,
  defaultValues
}: PlanFormProps) {
  return (
    <form action={action} className="panel p-6">
      {defaultValues?.id ? (
        <input type="hidden" name="planId" value={defaultValues.id} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm text-muted" htmlFor="name">
            Plan name
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="name"
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Unlimited Strength"
            required
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-muted" htmlFor="price">
            Price
          </label>
          <input
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="price"
            name="price"
            defaultValue={defaultValues?.price ?? ""}
            placeholder="149.00"
            required
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm text-muted"
            htmlFor="billingInterval"
          >
            Billing interval
          </label>
          <select
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
            id="billingInterval"
            name="billingInterval"
            defaultValue={defaultValues?.billingInterval ?? "monthly"}
          >
            {billingIntervals.map((interval) => (
              <option key={interval} value={interval}>
                {interval.charAt(0).toUpperCase() + interval.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 max-w-40">
        <SubmitButton idleLabel={submitLabel} pendingLabel={pendingLabel} />
      </div>
    </form>
  );
}
