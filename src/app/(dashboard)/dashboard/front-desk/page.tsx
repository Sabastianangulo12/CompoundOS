import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberQuickNotifyForm } from "@/components/dashboard/member-quick-notify-form";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { ServerActionButton } from "@/components/dashboard/server-action-button";
import {
  archiveFridgeProductAction,
  createFridgeProductAction,
  unlockFridgeSessionAction
} from "@/app/(dashboard)/dashboard/front-desk/actions";
import {
  completeMemberFollowUpTaskAction,
  createMemberFollowUpTaskAction
} from "@/app/(dashboard)/dashboard/members/actions";
import { formatWalletCurrency } from "@/lib/fridge-wallet";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type FrontDeskPageProps = {
  searchParams?: Promise<{
    message?: string;
    q?: string;
  }>;
};

type FridgeEventRow = Database["public"]["Tables"]["fridge_access_events"]["Row"] & {
  members: {
    first_name: string;
    last_name: string;
  } | null;
};

const fridgeCategories = [
  { value: "drinks_fridge", label: "Drinks Fridge" },
  { value: "meal_prep_fridge", label: "Meal Prep Fridge" },
  { value: "protein_candy", label: "Protein/Candy" },
  { value: "tclc_merch", label: "TCLC Merch" }
] as const;

export default async function FrontDeskPage({
  searchParams
}: FrontDeskPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  let memberLookupQuery = supabase
    .from("members")
    .select(
      "id, first_name, last_name, email, phone, status, frozen_until, stripe_default_payment_method_id, stripe_customer_id"
    )
    .eq("gym_id", currentGym.data.membership.gymId)
    .neq("status", "canceled")
    .order("first_name", {
      ascending: true
    })
    .limit(8);

  if (query) {
    const safeQuery = query.replace(/[%,'()]/g, " ").trim();
    memberLookupQuery = memberLookupQuery.or(
      [
        `first_name.ilike.%${safeQuery}%`,
        `last_name.ilike.%${safeQuery}%`,
        `email.ilike.%${safeQuery}%`,
        `phone.ilike.%${safeQuery}%`
      ].join(",")
    );
  }

  const [productsResult, eventsResult, memberLookupResult, recentQrCheckInsResult, recentSubscriptionsResult, recentFailedPaymentsResult, followUpTasksResult] = await Promise.all([
    supabase
      .from("fridge_products")
      .select("*")
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("is_active", {
        ascending: false
      })
      .order("sort_order", {
        ascending: true
      })
      .order("created_at", {
        ascending: false
      }),
    supabase
      .from("fridge_access_events")
      .select(
        `
          *,
          members (
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .order("created_at", {
        ascending: false
      })
      .limit(20),
    memberLookupQuery,
    supabase
      .from("check_ins")
      .select(
        `
          id,
          created_at,
          check_in_method,
          members (
            id,
            first_name,
            last_name,
            status
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("check_in_method", "qr")
      .order("created_at", {
        ascending: false
      })
      .limit(8),
    supabase
      .from("subscriptions")
      .select(
        `
          id,
          member_id,
          status,
          current_period_end,
          members (
            id,
            first_name,
            last_name
          ),
          membership_plans (
            id,
            name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .in("status", ["past_due", "active", "trialing"])
      .order("created_at", {
        ascending: false
      })
      .limit(20),
    supabase
      .from("payments")
      .select(
        `
          id,
          amount_cents,
          created_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "failed")
      .order("created_at", {
        ascending: false
      })
      .limit(8),
    supabase
      .from("member_follow_up_tasks")
      .select(
        `
          id,
          title,
          details,
          task_type,
          priority,
          status,
          due_at,
          created_at,
          members (
            id,
            first_name,
            last_name
          )
        `
      )
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("status", "open")
      .in("task_type", ["front_desk", "retention", "general"])
      .order("priority", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(8)
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  if (memberLookupResult.error) {
    throw new Error(memberLookupResult.error.message);
  }

  if (recentQrCheckInsResult.error) {
    throw new Error(recentQrCheckInsResult.error.message);
  }

  if (recentSubscriptionsResult.error) {
    throw new Error(recentSubscriptionsResult.error.message);
  }

  if (recentFailedPaymentsResult.error) {
    throw new Error(recentFailedPaymentsResult.error.message);
  }
  if (followUpTasksResult.error) {
    throw new Error(followUpTasksResult.error.message);
  }

  const products = productsResult.data ?? [];
  const activeProducts = products.filter((product) => product.is_active);
  const archivedProducts = products.filter((product) => !product.is_active);
  const groupedActiveProducts = fridgeCategories.map((category) => ({
    ...category,
    products: activeProducts.filter((product) => product.category === category.value)
  }));
  const events = (eventsResult.data ?? []) as FridgeEventRow[];
  const memberMatches = (memberLookupResult.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    status: string;
    frozen_until: string | null;
    stripe_default_payment_method_id: string | null;
    stripe_customer_id: string | null;
  }>;
  const recentQrCheckIns = (recentQrCheckInsResult.data ?? []) as Array<{
    id: string;
    created_at: string;
    check_in_method: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
      status: string;
    }> | null;
  }>;
  const recentSubscriptions = (recentSubscriptionsResult.data ?? []) as Array<{
    id: string;
    member_id: string;
    status: string;
    current_period_end: string | null;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
    membership_plans: Array<{
      id: string;
      name: string;
    }> | null;
  }>;
  const failedPayments = (recentFailedPaymentsResult.data ?? []) as Array<{
    id: string;
    amount_cents: number;
    created_at: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  const followUpTasks = (followUpTasksResult.data ?? []) as Array<{
    id: string;
    title: string;
    details: string | null;
    task_type: string;
    priority: string;
    status: string;
    due_at: string | null;
    created_at: string;
    members: Array<{
      id: string;
      first_name: string;
      last_name: string;
    }> | null;
  }>;
  const liveUnlockCount = events.filter((event) => event.status === "unlocked").length;
  const confirmedCount = events.filter((event) => event.status === "confirmed").length;
  const frozenMembers = memberMatches.filter((member) => member.status === "frozen");
  const pastDueMembers = recentSubscriptions.filter(
    (subscription) => subscription.status === "past_due"
  );

  return (
    <section className="space-y-6">
      <DashboardPageHeader
        eyebrow="Front desk"
        title="Front desk checkout"
        description={`Monitor live payment scans, seed your product folders, and confirm what members are buying at ${currentGym.data.membership.gymName}.`}
      />

      {resolvedSearchParams?.message ? (
        <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <PlaceholderCard
          title="Active products"
          value={String(activeProducts.length)}
          description="Products members can currently add to a fridge unlock."
        />
        <PlaceholderCard
          title="Live scans"
          value={String(liveUnlockCount)}
          description="Recent payment sessions currently marked scanned."
        />
        <PlaceholderCard
          title="Confirmed purchases"
          value={String(confirmedCount)}
          description="Recent sessions that completed payment confirmation."
        />
        <PlaceholderCard
          title="Monitor mode"
          value="Live"
          description="Front desk is watching recent Smart Fridge activity."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="Frozen alerts"
          value={String(frozenMembers.length)}
          description="Members at the desk who may need a renewal conversation."
        />
        <PlaceholderCard
          title="Past due billing"
          value={String(pastDueMembers.length)}
          description="Subscriptions currently needing recovery."
        />
        <PlaceholderCard
          title="Failed payments"
          value={String(failedPayments.length)}
          description="Recent failed charges staff may need to address."
        />
        <PlaceholderCard
          title="Open follow-ups"
          value={String(followUpTasks.length)}
          description="Tasks staff should resolve from the desk."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="space-y-6">
          <section className="panel-hero p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Quick member lookup</h2>
                <p className="mt-2 text-sm text-muted">
                  Search members by name, email, or phone to open their profile fast at the desk.
                </p>
              </div>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium"
                href="/dashboard/check-ins/scan"
              >
                Open QR check-in scanner
              </Link>
            </div>
            <form className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                defaultValue={query}
                name="q"
                placeholder="Search member name, email, or phone"
              />
              <div className="flex gap-3">
                <button
                  className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-black"
                  type="submit"
                >
                  Search
                </button>
                <a
                  className="inline-flex items-center rounded-2xl border border-border px-4 py-3 text-sm text-muted hover:text-foreground"
                  href="/dashboard/front-desk"
                >
                  Reset
                </a>
              </div>
            </form>
            <div className="mt-5 space-y-3">
              {memberMatches.length === 0 ? (
                <p className="text-sm text-muted">
                  No member matches found for this search.
                </p>
              ) : (
                memberMatches.map((member) => (
                  <div
                    key={member.id}
                    className="panel-soft flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {member.first_name} {member.last_name}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {member.email ?? "No email"} | {member.phone ?? "No phone"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {member.status}
                        {member.frozen_until ? ` | Frozen until ${member.frozen_until}` : ""}
                        {!member.stripe_default_payment_method_id &&
                        !member.stripe_customer_id
                          ? " | No card on file"
                          : ""}
                      </p>
                    </div>
                    <Link className="action-link" href={`/dashboard/members/${member.id}/edit`}>
                      Open member
                    </Link>
                    <MemberQuickNotifyForm
                      memberId={member.id}
                      redirectTo="/dashboard/front-desk"
                      title="Front desk follow-up"
                      body={`Hi ${member.first_name}, the front desk flagged your account and we wanted to reach out with the next step.`}
                      type="general"
                    />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Front desk alerts</h2>
              <p className="mt-1 text-sm text-muted">
                The biggest member issues staff may need to resolve in person right now.
              </p>
            </div>
            <div className="grid gap-4 px-6 py-6 xl:grid-cols-3">
              <div className="panel-soft p-4">
                <p className="section-kicker text-muted">Frozen</p>
                <div className="mt-4 space-y-3">
                  {frozenMembers.length === 0 ? (
                    <p className="text-sm text-muted">No frozen members in the current lookup set.</p>
                  ) : (
                    frozenMembers.slice(0, 4).map((member) => (
                      <div key={member.id}>
                        <p className="text-sm font-medium">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Frozen until {member.frozen_until ?? "not set"}
                        </p>
                        <div className="mt-2 flex gap-3 text-xs">
                          <Link
                            className="font-medium text-foreground"
                            href={`/dashboard/members/${member.id}/edit`}
                          >
                            Open
                          </Link>
                          <MemberQuickNotifyForm
                            memberId={member.id}
                            redirectTo="/dashboard/front-desk"
                            title="Your membership is currently frozen"
                            body={`Hi ${member.first_name}, your membership is currently frozen${member.frozen_until ? ` until ${member.frozen_until}` : ""}. If you want help resuming it, reply and we will take care of it.`}
                            type="billing"
                            label="Notify"
                            className="text-muted hover:text-foreground"
                          />
                          <form action={createMemberFollowUpTaskAction}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input type="hidden" name="redirectTo" value="/dashboard/front-desk" />
                            <input
                              type="hidden"
                              name="title"
                              value="Resolve frozen membership at front desk"
                            />
                            <input
                              type="hidden"
                              name="details"
                              value={`Member is frozen${member.frozen_until ? ` until ${member.frozen_until}` : ""} and may need renewal support at the front desk.`}
                            />
                            <input type="hidden" name="taskType" value="front_desk" />
                            <input type="hidden" name="priority" value="high" />
                            <ServerActionButton
                              idleLabel="Create task"
                              pendingLabel="Creating..."
                              variant="ghost"
                              className="px-0 py-0"
                            />
                          </form>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="panel-soft p-4">
                <p className="section-kicker text-muted">Past due</p>
                <div className="mt-4 space-y-3">
                  {pastDueMembers.length === 0 ? (
                    <p className="text-sm text-muted">No past due subscriptions right now.</p>
                  ) : (
                    pastDueMembers.slice(0, 4).map((subscription) => {
                      const member = toOneRelation(subscription.members);
                      const plan = toOneRelation(subscription.membership_plans);
                      return (
                        <div key={subscription.id}>
                          <p className="text-sm font-medium">
                            {member
                              ? `${member.first_name} ${member.last_name}`
                              : "Unknown member"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {plan?.name ?? "Plan missing"}
                            {subscription.current_period_end
                              ? ` | Ended ${new Date(subscription.current_period_end).toLocaleDateString("en-US")}`
                              : ""}
                          </p>
                          {member ? (
                            <div className="mt-2 flex gap-3 text-xs">
                              <Link
                                className="font-medium text-foreground"
                                href={`/dashboard/members/${member.id}/edit`}
                              >
                                Open
                              </Link>
                              <MemberQuickNotifyForm
                                memberId={member.id}
                                redirectTo="/dashboard/front-desk"
                                title="Your membership payment needs attention"
                                body={`Hi ${member.first_name}, your membership payment is past due. Please stop by or reply so we can help resolve it.`}
                                type="billing"
                                label="Notify"
                                className="text-muted hover:text-foreground"
                              />
                              <form action={createMemberFollowUpTaskAction}>
                                <input type="hidden" name="memberId" value={member.id} />
                                <input type="hidden" name="redirectTo" value="/dashboard/front-desk" />
                                <input
                                  type="hidden"
                                  name="title"
                                  value="Resolve past due billing at front desk"
                                />
                                <input
                                  type="hidden"
                                  name="details"
                                  value={`Subscription${plan?.name ? ` for ${plan.name}` : ""} is past due and needs payment recovery.`}
                                />
                                <input type="hidden" name="taskType" value="billing" />
                                <input type="hidden" name="priority" value="high" />
                                <ServerActionButton
                                  idleLabel="Create task"
                                  pendingLabel="Creating..."
                                  variant="ghost"
                                  className="px-0 py-0"
                                />
                              </form>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="panel-soft p-4">
                <p className="section-kicker text-muted">Failed payments</p>
                <div className="mt-4 space-y-3">
                  {failedPayments.length === 0 ? (
                    <p className="text-sm text-muted">No recent failed charges.</p>
                  ) : (
                    failedPayments.slice(0, 4).map((payment) => {
                      const member = toOneRelation(payment.members);
                      return (
                        <div key={payment.id}>
                          <p className="text-sm font-medium">
                            {member
                              ? `${member.first_name} ${member.last_name}`
                              : "Unknown member"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {formatWalletCurrency(payment.amount_cents)} |{" "}
                            {new Date(payment.created_at).toLocaleDateString("en-US")}
                          </p>
                          {member ? (
                            <div className="mt-2 flex gap-3 text-xs">
                              <Link
                                className="font-medium text-foreground"
                                href={`/dashboard/members/${member.id}/edit`}
                              >
                                Open
                              </Link>
                              <MemberQuickNotifyForm
                                memberId={member.id}
                                redirectTo="/dashboard/front-desk"
                                title="We need to update your payment"
                                body={`Hi ${member.first_name}, a recent payment did not go through. Stop by the front desk or reply so we can help fix it.`}
                                type="billing"
                                label="Notify"
                                className="text-muted hover:text-foreground"
                              />
                              <form action={createMemberFollowUpTaskAction}>
                                <input type="hidden" name="memberId" value={member.id} />
                                <input type="hidden" name="redirectTo" value="/dashboard/front-desk" />
                                <input
                                  type="hidden"
                                  name="title"
                                  value="Collect payment after failed charge"
                                />
                                <input
                                  type="hidden"
                                  name="details"
                                  value={`Recent failed payment for ${formatWalletCurrency(payment.amount_cents)} needs follow-up.`}
                                />
                                <input type="hidden" name="taskType" value="billing" />
                                <input type="hidden" name="priority" value="high" />
                                <ServerActionButton
                                  idleLabel="Create task"
                                  pendingLabel="Creating..."
                                  variant="ghost"
                                  className="px-0 py-0"
                                />
                              </form>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Open follow-up tasks</h2>
              <p className="mt-1 text-sm text-muted">
                Front desk and retention work that should be handled while the member is physically present.
              </p>
            </div>
            <div className="divide-y divide-border">
              {followUpTasks.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No open follow-up tasks in the front desk queue.
                </div>
              ) : (
                followUpTasks.map((task) => {
                  const member = toOneRelation(task.members);
                  return (
                    <div
                      key={task.id}
                      className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{task.title}</p>
                          <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                            {task.task_type.replace("_", " ")}
                          </span>
                          <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                            {task.priority}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {member
                            ? `${member.first_name} ${member.last_name}`
                            : "No member linked"}
                          {task.details ? ` | ${task.details}` : ""}
                        </p>
                      </div>
                      <div className="text-sm text-muted lg:text-right">
                        <p>
                          {task.due_at
                            ? `Due ${new Date(task.due_at).toLocaleDateString("en-US")}`
                            : "No due date"}
                        </p>
                        <div className="mt-1 flex items-center gap-3 lg:justify-end">
                          {member ? (
                            <Link
                              className="font-medium text-foreground"
                              href={`/dashboard/members/${member.id}/edit`}
                            >
                              Open member
                            </Link>
                          ) : null}
                          {member ? (
                            <form action={completeMemberFollowUpTaskAction}>
                              <input type="hidden" name="taskId" value={task.id} />
                              <input type="hidden" name="memberId" value={member.id} />
                              <input type="hidden" name="redirectTo" value="/dashboard/front-desk" />
                              <ServerActionButton
                                idleLabel="Complete"
                                pendingLabel="Completing..."
                                variant="ghost"
                                className="px-0 py-0"
                              />
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="text-lg font-semibold">Payment scanner utility</h2>
            <p className="mt-2 text-sm text-muted">
              Paste a short-lived payment QR token here to simulate the front desk scanner.
              Scanning prepares the session for payment, but still does not charge the member.
            </p>
            <div className="mt-4 rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
              Best front-desk flow: scan the member QR, confirm the cart, then wait for the member app to finish the charge confirmation.
            </div>
            <form action={unlockFridgeSessionAction} className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="qrToken">
                  QR token
                </label>
                <input
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                  id="qrToken"
                  name="qrToken"
                  placeholder="Paste payment QR token"
                  required
                  type="text"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="fridgeLabel">
                  Fridge label
                </label>
                <input
                  className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                  defaultValue="Front Desk Checkout"
                  id="fridgeLabel"
                  name="fridgeLabel"
                  type="text"
                />
              </div>
              <ServerActionButton
                idleLabel="Approve scan"
                pendingLabel="Approving scan..."
                className="rounded-2xl"
              />
            </form>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Product library</h2>
            <p className="mt-1 text-sm text-muted">
              Add the products the current gym wants visible in the wallet.
            </p>
            </div>
            <div className="p-6">
              <form action={createFridgeProductAction} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="category">
                    Folder
                  </label>
                  <select
                    className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                    defaultValue="drinks_fridge"
                    id="category"
                    name="category"
                  >
                    {fridgeCategories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="name">
                    Product name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                    id="name"
                    name="name"
                    placeholder="Protein shake"
                    required
                    type="text"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="description">
                    Description
                  </label>
                  <input
                    className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                    id="description"
                    name="description"
                    placeholder="24g protein, vanilla"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="price">
                    Price
                  </label>
                  <input
                    className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                    id="price"
                    name="price"
                    placeholder="6.50"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="sortOrder">
                    Sort order
                  </label>
                  <input
                    className="w-full rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-accent"
                    defaultValue="0"
                    id="sortOrder"
                    name="sortOrder"
                    type="number"
                  />
                </div>
                <div className="md:col-span-2">
                  <ServerActionButton
                    idleLabel="Add product"
                    pendingLabel="Adding product..."
                    className="rounded-2xl"
                  />
                </div>
              </form>
            </div>

            <div className="divide-y divide-border">
              {activeProducts.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted">
                  No active fridge products yet.
                </div>
              ) : (
                groupedActiveProducts.map((group) => (
                  <div key={group.value} className="px-6 py-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      {group.label}
                    </p>
                    {group.products.length === 0 ? (
                      <p className="mt-3 text-sm text-muted">
                        No products assigned yet.
                      </p>
                    ) : (
                      <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-black/10">
                        {group.products.map((product) => (
                          <div
                            key={product.id}
                            className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                          >
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="mt-1 text-sm text-muted">
                                {product.description || "No description"} -{" "}
                                {formatWalletCurrency(product.price_cents)}
                              </p>
                            </div>
                            <form action={archiveFridgeProductAction}>
                              <input name="productId" type="hidden" value={product.id} />
                              <ServerActionButton
                                idleLabel="Archive"
                                pendingLabel="Archiving..."
                                variant="secondary"
                                className="rounded-xl px-4 py-2"
                              />
                            </form>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {archivedProducts.length > 0 ? (
              <div className="border-t border-border px-6 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">
                  Archived
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {archivedProducts.map((product) => (
                    <span
                      key={product.id}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted"
                    >
                      {product.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Recent arrivals and payment events</h2>
            <p className="mt-1 text-sm text-muted">
              Recent member QR arrivals alongside recent payment scans.
            </p>
          </div>
          <div className="grid gap-0 xl:grid-cols-2">
            <div className="border-b border-border xl:border-b-0 xl:border-r">
              <div className="px-6 py-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                  Recent QR check-ins
                </h3>
              </div>
              <div className="divide-y divide-border">
                {recentQrCheckIns.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-muted">
                    No recent QR check-ins.
                  </div>
                ) : (
                  recentQrCheckIns.map((checkIn) => {
                    const member = toOneRelation(checkIn.members);
                    return (
                      <div
                        key={checkIn.id}
                        className="flex flex-col gap-2 px-6 py-4"
                      >
                        <p className="font-medium">
                          {member
                            ? `${member.first_name} ${member.last_name}`
                            : "Unknown member"}
                        </p>
                        <p className="text-sm text-muted capitalize">
                          {member?.status ?? "Unknown status"}
                        </p>
                        <p className="text-sm text-muted">
                          {new Date(checkIn.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: currentGym.data.membership.gymTimezone
                          })}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div>
              <div className="px-6 py-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                  Recent payment events
                </h3>
              </div>
              <div className="divide-y divide-border">
                {events.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-muted">
                    No payment events yet.
                  </div>
                ) : (
                  events.map((event) => (
                    <article
                      key={event.id}
                      className="space-y-4 px-6 py-5"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {event.members
                                ? `${event.members.first_name} ${event.members.last_name}`
                                : "Unknown member"}
                            </p>
                            <span
                              className={[
                                "rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
                                getEventBadgeClass(event.status)
                              ].join(" ")}
                            >
                              {event.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            {event.fridge_label} - {formatWalletCurrency(event.estimated_total_cents)}
                          </p>
                        </div>
                        <p className="text-sm text-muted">
                          {new Date(event.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: currentGym.data.membership.gymTimezone
                          })}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-black/20 px-4 py-3 text-sm text-muted">
                        {formatSelectedItems(event.selected_items)}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function formatSelectedItems(selectedItems: unknown) {
  if (!Array.isArray(selectedItems) || selectedItems.length === 0) {
    return "No selected items were saved for this session.";
  }

  return selectedItems
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as {
        name?: unknown;
        quantity?: unknown;
      };

      const name = typeof record.name === "string" ? record.name : "Item";
      const quantity =
        typeof record.quantity === "number" ? record.quantity : Number(record.quantity ?? 0);

      return `${Math.max(0, quantity)} x ${name}`;
    })
    .filter((item): item is string => Boolean(item))
    .join(", ");
}

function getEventBadgeClass(status: FridgeEventRow["status"]) {
  if (status === "confirmed") {
    return "border border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "unlocked") {
    return "border border-accent/30 bg-accent/10 text-accent";
  }

  if (status === "expired" || status === "canceled") {
    return "border border-border bg-white/5 text-muted";
  }

  return "border border-amber-400/30 bg-amber-400/10 text-amber-100";
}
