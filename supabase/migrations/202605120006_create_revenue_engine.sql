create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'weekly')),
  is_active boolean not null default true,
  archived_at timestamptz,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  membership_plan_id uuid references public.membership_plans (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'past_due', 'trialing', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_subscription_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('succeeded', 'failed', 'pending')),
  paid_at timestamptz,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists membership_plans_gym_id_active_idx
on public.membership_plans (gym_id, is_active, created_at desc);

create index if not exists subscriptions_gym_id_status_idx
on public.subscriptions (gym_id, status, created_at desc);

create index if not exists subscriptions_member_id_idx
on public.subscriptions (member_id, created_at desc);

create index if not exists payments_gym_id_status_idx
on public.payments (gym_id, status, created_at desc);

create index if not exists payments_subscription_id_idx
on public.payments (subscription_id, created_at desc);

alter table public.membership_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

drop trigger if exists membership_plans_set_updated_at on public.membership_plans;
create trigger membership_plans_set_updated_at
before update on public.membership_plans
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view membership_plans for their gyms" on public.membership_plans;
create policy "Users can view membership_plans for their gyms"
on public.membership_plans
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = membership_plans.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can insert membership_plans for their gyms" on public.membership_plans;
create policy "Users can insert membership_plans for their gyms"
on public.membership_plans
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = membership_plans.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can update membership_plans for their gyms" on public.membership_plans;
create policy "Users can update membership_plans for their gyms"
on public.membership_plans
for update
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = membership_plans.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = membership_plans.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can view subscriptions for their gyms" on public.subscriptions;
create policy "Users can view subscriptions for their gyms"
on public.subscriptions
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = subscriptions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can insert subscriptions for their gyms" on public.subscriptions;
create policy "Users can insert subscriptions for their gyms"
on public.subscriptions
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = subscriptions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1 from public.members
    where members.id = subscriptions.member_id
      and members.gym_id = subscriptions.gym_id
  )
  and (
    subscriptions.membership_plan_id is null
    or exists (
      select 1 from public.membership_plans
      where membership_plans.id = subscriptions.membership_plan_id
        and membership_plans.gym_id = subscriptions.gym_id
    )
  )
);

drop policy if exists "Users can update subscriptions for their gyms" on public.subscriptions;
create policy "Users can update subscriptions for their gyms"
on public.subscriptions
for update
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = subscriptions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = subscriptions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1 from public.members
    where members.id = subscriptions.member_id
      and members.gym_id = subscriptions.gym_id
  )
  and (
    subscriptions.membership_plan_id is null
    or exists (
      select 1 from public.membership_plans
      where membership_plans.id = subscriptions.membership_plan_id
        and membership_plans.gym_id = subscriptions.gym_id
    )
  )
);

drop policy if exists "Users can view payments for their gyms" on public.payments;
create policy "Users can view payments for their gyms"
on public.payments
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = payments.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can insert payments for their gyms" on public.payments;
create policy "Users can insert payments for their gyms"
on public.payments
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = payments.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    payments.member_id is null
    or exists (
      select 1 from public.members
      where members.id = payments.member_id
        and members.gym_id = payments.gym_id
    )
  )
  and (
    payments.subscription_id is null
    or exists (
      select 1 from public.subscriptions
      where subscriptions.id = payments.subscription_id
        and subscriptions.gym_id = payments.gym_id
    )
  )
);
