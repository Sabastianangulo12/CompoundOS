import { SubmitButton } from "@/components/auth/submit-button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { memberStatuses, type MemberStatus } from "@/lib/members";
import { formatCurrencyFromCents, type BillingInterval } from "@/lib/revenue";

type MemberFormValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  status?: MemberStatus;
  joinedAt?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  medicalNotes?: string | null;
  waiverRequired?: boolean;
  waiverTitle?: string | null;
  waiverBody?: string | null;
  waiverSignatureName?: string | null;
  waiverSignedAt?: string | null;
  membershipPlanId?: string | null;
};

type MembershipPlanOption = {
  billingInterval: BillingInterval;
  id: string;
  name: string;
  priceCents: number;
};

type MemberFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  defaultValues?: MemberFormValues;
  membershipPlans?: MembershipPlanOption[];
};

function Field({
  children,
  htmlFor,
  label
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionSummary({
  description,
  eyebrow,
  title
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </>
  );
}

export function MemberForm({
  action,
  submitLabel,
  pendingLabel,
  defaultValues,
  membershipPlans = []
}: MemberFormProps) {
  return (
    <form action={action} className="space-y-6">
      {defaultValues?.id ? (
        <input name="memberId" type="hidden" value={defaultValues.id} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel space-y-4 p-6 xl:col-span-2">
          <SectionSummary
            description="Choose the signup plan now so the desk can move directly into billing after the profile is created."
            eyebrow="Membership"
            title="Initial plan selection"
          />
          {membershipPlans.length === 0 ? (
            <div className="rounded-2xl border border-border bg-black/10 px-4 py-4 text-sm text-muted">
              No active membership plans are available yet. Create plans in Memberships &amp; Billing first.
            </div>
          ) : (
            <div className="space-y-4">
              <Field htmlFor="membershipPlanId" label="Membership plan">
                <select
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.membershipPlanId ?? ""}
                  id="membershipPlanId"
                  name="membershipPlanId"
                >
                  <option value="">Select a plan during signup</option>
                  {membershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrencyFromCents(plan.priceCents)} /{" "}
                      {plan.billingInterval === "weekly" ? "week" : "month"}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="rounded-2xl border border-border bg-black/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  Active plans and pricing
                </p>
                <div className="mt-3 space-y-2">
                  {membershipPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-black/10 px-3 py-3"
                    >
                      <p className="text-sm font-medium text-foreground">{plan.name}</p>
                      <p className="text-sm text-muted">
                        {formatCurrencyFromCents(plan.priceCents)} /{" "}
                        {plan.billingInterval === "weekly" ? "week" : "month"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="panel space-y-4 p-6">
          <SectionSummary
            description="The main desk details needed to identify and contact the member."
            eyebrow="Member basics"
            title="Core profile"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field htmlFor="firstName" label="First name">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.firstName ?? ""}
                id="firstName"
                name="firstName"
                required
              />
            </Field>
            <Field htmlFor="lastName" label="Last name">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.lastName ?? ""}
                id="lastName"
                name="lastName"
                required
              />
            </Field>
            <Field htmlFor="email" label="Email">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.email ?? ""}
                id="email"
                name="email"
                type="email"
              />
            </Field>
            <Field htmlFor="phone" label="Phone">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.phone ?? ""}
                id="phone"
                name="phone"
              />
            </Field>
            <Field htmlFor="dateOfBirth" label="Date of birth">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.dateOfBirth ?? ""}
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
              />
            </Field>
            <Field htmlFor="status" label="Status">
              <select
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.status ?? "lead"}
                id="status"
                name="status"
              >
                {memberStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field htmlFor="joinedAt" label="Joined at">
              <input
                className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                defaultValue={defaultValues?.joinedAt ?? ""}
                id="joinedAt"
                name="joinedAt"
                type="date"
              />
            </Field>
          </div>
        </section>

        <div className="xl:col-span-2 space-y-6">
          <CollapsibleCard
            description="Open to capture the member's street, city, state, and postal code."
            eyebrow="Address"
            title="Home address"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field htmlFor="addressLine1" label="Address line 1">
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    defaultValue={defaultValues?.addressLine1 ?? ""}
                    id="addressLine1"
                    name="addressLine1"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field htmlFor="addressLine2" label="Address line 2">
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    defaultValue={defaultValues?.addressLine2 ?? ""}
                    id="addressLine2"
                    name="addressLine2"
                  />
                </Field>
              </div>
              <Field htmlFor="city" label="City">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.city ?? ""}
                  id="city"
                  name="city"
                />
              </Field>
              <Field htmlFor="stateRegion" label="State / region">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.stateRegion ?? ""}
                  id="stateRegion"
                  name="stateRegion"
                />
              </Field>
              <Field htmlFor="postalCode" label="Postal code">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.postalCode ?? ""}
                  id="postalCode"
                  name="postalCode"
                />
              </Field>
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            description="Open to add emergency contact and medical notes."
            eyebrow="Emergency contact"
            title="Who the gym should call"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="emergencyContactName" label="Contact name">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.emergencyContactName ?? ""}
                  id="emergencyContactName"
                  name="emergencyContactName"
                />
              </Field>
              <Field htmlFor="emergencyContactRelationship" label="Relationship">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.emergencyContactRelationship ?? ""}
                  id="emergencyContactRelationship"
                  name="emergencyContactRelationship"
                  placeholder="Parent, partner, sibling, friend"
                />
              </Field>
              <Field htmlFor="emergencyContactPhone" label="Contact phone">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.emergencyContactPhone ?? ""}
                  id="emergencyContactPhone"
                  name="emergencyContactPhone"
                />
              </Field>
              <div className="md:col-span-2">
                <Field htmlFor="medicalNotes" label="Medical notes">
                  <textarea
                    className="min-h-28 w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    defaultValue={defaultValues?.medicalNotes ?? ""}
                    id="medicalNotes"
                    name="medicalNotes"
                    placeholder="Allergies, injury notes, medical considerations, or front-desk instructions."
                  />
                </Field>
              </div>
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            description="Open to review the waiver, collect signature text, and signed date."
            eyebrow="Waiver"
            title="Signature and release"
          >
            <div className="grid gap-4">
              <label className="flex items-center gap-3 rounded-xl border border-border bg-black/10 px-4 py-3 text-sm text-foreground">
                <input
                  className="h-4 w-4 rounded border-border bg-black/20"
                  defaultChecked={defaultValues?.waiverRequired ?? false}
                  name="waiverRequired"
                  type="checkbox"
                  value="true"
                />
                Waiver is required for this member
              </label>
              <Field htmlFor="waiverTitle" label="Waiver title">
                <input
                  className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.waiverTitle ?? ""}
                  id="waiverTitle"
                  name="waiverTitle"
                  placeholder="Membership waiver and liability release"
                />
              </Field>
              <Field htmlFor="waiverBody" label="Waiver body">
                <textarea
                  className="min-h-40 w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                  defaultValue={defaultValues?.waiverBody ?? ""}
                  id="waiverBody"
                  name="waiverBody"
                  placeholder="Paste the member waiver text here."
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field htmlFor="waiverSignatureName" label="Signed by">
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    defaultValue={defaultValues?.waiverSignatureName ?? ""}
                    id="waiverSignatureName"
                    name="waiverSignatureName"
                    placeholder="Member signature name"
                  />
                </Field>
                <Field htmlFor="waiverSignedAt" label="Signed on">
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 outline-none"
                    defaultValue={defaultValues?.waiverSignedAt ?? ""}
                    id="waiverSignedAt"
                    name="waiverSignedAt"
                    type="date"
                  />
                </Field>
              </div>
            </div>
          </CollapsibleCard>
        </div>
      </div>

      <div className="panel flex justify-end p-4">
        <SubmitButton idleLabel={submitLabel} pendingLabel={pendingLabel} />
      </div>
    </form>
  );
}
