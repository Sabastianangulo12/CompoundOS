-- The Compound Lifting Club OS
-- Combined Supabase setup migration
-- Generated from ./supabase/migrations in filename order
-- Paste this entire file into Supabase SQL Editor and run it once on a fresh project.

-- >>> BEGIN 202605120001_create_profiles.sql

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  gym_name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'coach', 'staff')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- <<< END 202605120001_create_profiles.sql


-- >>> BEGIN 202605120002_create_gyms_and_gym_users.sql

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid references auth.users (id) on delete set null,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gym_users (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'coach', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, user_id)
);

alter table public.gyms enable row level security;
alter table public.gym_users enable row level security;

drop trigger if exists gyms_set_updated_at on public.gyms;
create trigger gyms_set_updated_at
before update on public.gyms
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists gym_users_set_updated_at on public.gym_users;
create trigger gym_users_set_updated_at
before update on public.gym_users
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view gyms they belong to" on public.gyms;
create policy "Users can view gyms they belong to"
on public.gyms
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gyms.id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Owners can create gyms" on public.gyms;
create policy "Owners can create gyms"
on public.gyms
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "Users can view their gym memberships" on public.gym_users;
create policy "Users can view their gym memberships"
on public.gym_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create their own owner membership" on public.gym_users;
create policy "Users can create their own owner membership"
on public.gym_users
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
);

create or replace function public.create_gym_with_owner_membership(
  gym_name text,
  gym_slug text
)
returns table (gym_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_gym_id uuid;
begin
  insert into public.gyms (name, slug, owner_user_id)
  values (gym_name, gym_slug, auth.uid())
  returning id into new_gym_id;

  insert into public.gym_users (gym_id, user_id, role, is_active)
  values (new_gym_id, auth.uid(), 'owner', true);

  return query select new_gym_id;
end;
$$;

grant execute on function public.create_gym_with_owner_membership(text, text) to authenticated;

-- <<< END 202605120002_create_gyms_and_gym_users.sql


-- >>> BEGIN 202605120003_create_members.sql

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  status text not null default 'lead' check (status in ('lead', 'active', 'frozen', 'canceled')),
  joined_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists members_gym_id_idx on public.members (gym_id);
create index if not exists members_status_idx on public.members (status);
create index if not exists members_email_idx on public.members (email);

alter table public.members enable row level security;

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view members for their gyms" on public.members;
create policy "Users can view members for their gyms"
on public.members
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = members.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can create members for their gyms" on public.members;
create policy "Users can create members for their gyms"
on public.members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = members.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can update members for their gyms" on public.members;
create policy "Users can update members for their gyms"
on public.members
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = members.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = members.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605120003_create_members.sql


-- >>> BEGIN 202605120004_create_check_ins.sql

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  check_in_method text not null default 'manual' check (check_in_method in ('manual')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists check_ins_gym_id_created_at_idx
on public.check_ins (gym_id, created_at desc);

create index if not exists check_ins_member_id_created_at_idx
on public.check_ins (member_id, created_at desc);

alter table public.check_ins enable row level security;

drop policy if exists "Users can view check_ins for their gyms" on public.check_ins;
create policy "Users can view check_ins for their gyms"
on public.check_ins
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = check_ins.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can create check_ins for their gyms" on public.check_ins;
create policy "Users can create check_ins for their gyms"
on public.check_ins
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = check_ins.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
  )
);

-- <<< END 202605120004_create_check_ins.sql


-- >>> BEGIN 202605120005_create_member_scores_and_ai_insights.sql

create table if not exists public.member_scores (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  engagement_score integer not null check (engagement_score between 0 and 100),
  retention_risk_score integer not null check (retention_risk_score between 0 and 100),
  last_calculated_at timestamptz not null default timezone('utc', now()),
  primary key (gym_id, member_id)
);

create index if not exists member_scores_gym_risk_idx
on public.member_scores (gym_id, retention_risk_score desc);

alter table public.member_scores enable row level security;

drop policy if exists "Users can view member_scores for their gyms" on public.member_scores;
create policy "Users can view member_scores for their gyms"
on public.member_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can upsert member_scores for their gyms" on public.member_scores;
create policy "Users can upsert member_scores for their gyms"
on public.member_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1
    from public.members
    where members.id = member_scores.member_id
      and members.gym_id = member_scores.gym_id
  )
);

drop policy if exists "Users can update member_scores for their gyms" on public.member_scores;
create policy "Users can update member_scores for their gyms"
on public.member_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1
    from public.members
    where members.id = member_scores.member_id
      and members.gym_id = member_scores.gym_id
  )
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  type text not null check (
    type in (
      'retention_risk',
      'inactivity',
      'attendance_drop',
      'failed_payment',
      'missing_subscription',
      'revenue_leak',
      'upsell_opportunity'
    )
  ),
  title text not null,
  description text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_insights_gym_priority_idx
on public.ai_insights (gym_id, priority, created_at desc);

create index if not exists ai_insights_member_idx
on public.ai_insights (member_id, created_at desc);

alter table public.ai_insights enable row level security;

drop policy if exists "Users can view ai_insights for their gyms" on public.ai_insights;
create policy "Users can view ai_insights for their gyms"
on public.ai_insights
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can create ai_insights for their gyms" on public.ai_insights;
create policy "Users can create ai_insights for their gyms"
on public.ai_insights
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    ai_insights.member_id is null
    or exists (
      select 1
      from public.members
      where members.id = ai_insights.member_id
        and members.gym_id = ai_insights.gym_id
    )
  )
);

drop policy if exists "Users can update ai_insights for their gyms" on public.ai_insights;
create policy "Users can update ai_insights for their gyms"
on public.ai_insights
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    ai_insights.member_id is null
    or exists (
      select 1
      from public.members
      where members.id = ai_insights.member_id
        and members.gym_id = ai_insights.gym_id
    )
  )
);

drop policy if exists "Users can delete ai_insights for their gyms" on public.ai_insights;
create policy "Users can delete ai_insights for their gyms"
on public.ai_insights
for delete
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605120005_create_member_scores_and_ai_insights.sql


-- >>> BEGIN 202605120006_create_revenue_engine.sql

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

-- <<< END 202605120006_create_revenue_engine.sql


-- >>> BEGIN 202605120007_create_automations.sql

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('insight_created', 'member_inactive', 'payment_failed')),
  insight_type text,
  action_type text not null check (action_type in ('create_insight', 'log_action')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, name)
);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  insight_id uuid references public.ai_insights (id) on delete set null,
  result text not null check (result in ('success', 'skipped')),
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists automations_gym_active_idx
on public.automations (gym_id, is_active, created_at desc);

create index if not exists automation_logs_gym_created_idx
on public.automation_logs (gym_id, created_at desc);

create index if not exists automation_logs_automation_created_idx
on public.automation_logs (automation_id, created_at desc);

alter table public.automations enable row level security;
alter table public.automation_logs enable row level security;

drop policy if exists "Users can view automations for their gyms" on public.automations;
create policy "Users can view automations for their gyms"
on public.automations
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automations.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can insert automations for their gyms" on public.automations;
create policy "Users can insert automations for their gyms"
on public.automations
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automations.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can update automations for their gyms" on public.automations;
create policy "Users can update automations for their gyms"
on public.automations
for update
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automations.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automations.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can view automation_logs for their gyms" on public.automation_logs;
create policy "Users can view automation_logs for their gyms"
on public.automation_logs
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automation_logs.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can insert automation_logs for their gyms" on public.automation_logs;
create policy "Users can insert automation_logs for their gyms"
on public.automation_logs
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = automation_logs.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1 from public.automations
    where automations.id = automation_logs.automation_id
      and automations.gym_id = automation_logs.gym_id
  )
  and (
    automation_logs.member_id is null
    or exists (
      select 1 from public.members
      where members.id = automation_logs.member_id
        and members.gym_id = automation_logs.gym_id
    )
  )
  and (
    automation_logs.insight_id is null
    or exists (
      select 1 from public.ai_insights
      where ai_insights.id = automation_logs.insight_id
        and ai_insights.gym_id = automation_logs.gym_id
    )
  )
);

-- <<< END 202605120007_create_automations.sql


-- >>> BEGIN 202605120008_enable_member_mobile_access.sql

drop policy if exists "Members can view their own gym" on public.gyms;
create policy "Members can view their own gym"
on public.gyms
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.gym_id = gyms.id
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Members can view their own member record" on public.members;
create policy "Members can view their own member record"
on public.members
for select
to authenticated
using (
  status <> 'canceled'
  and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Members can view their own check_ins" on public.check_ins;
create policy "Members can view their own check_ins"
on public.check_ins
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Members can create their own check_ins" on public.check_ins;
create policy "Members can create their own check_ins"
on public.check_ins
for insert
to authenticated
with check (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- <<< END 202605120008_enable_member_mobile_access.sql


-- >>> BEGIN 202605120009_add_qr_check_in_method.sql

alter table public.check_ins
drop constraint if exists check_ins_check_in_method_check;

alter table public.check_ins
add constraint check_ins_check_in_method_check
check (check_in_method in ('manual', 'qr'));

-- <<< END 202605120009_add_qr_check_in_method.sql


-- >>> BEGIN 202605120010_link_members_to_auth_users.sql

alter table public.members
add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists members_user_id_unique_idx
on public.members (user_id)
where user_id is not null;

create index if not exists members_gym_user_idx
on public.members (gym_id, user_id);

create or replace function public.claim_member_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_member_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.members
  set user_id = auth.uid(),
      updated_at = timezone('utc', now())
  where user_id is null
    and status <> 'canceled'
    and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning id into claimed_member_id;

  if claimed_member_id is not null then
    return claimed_member_id;
  end if;

  select id
  into claimed_member_id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  return claimed_member_id;
end;
$$;

grant execute on function public.claim_member_profile() to authenticated;

drop policy if exists "Members can view their own gym" on public.gyms;
create policy "Members can view their own gym"
on public.gyms
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.gym_id = gyms.id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Members can view their own member record" on public.members;
create policy "Members can view their own member record"
on public.members
for select
to authenticated
using (
  status <> 'canceled'
  and user_id = auth.uid()
);

drop policy if exists "Members can view their own check_ins" on public.check_ins;
create policy "Members can view their own check_ins"
on public.check_ins
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Members can create their own check_ins" on public.check_ins;
create policy "Members can create their own check_ins"
on public.check_ins
for insert
to authenticated
with check (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

-- <<< END 202605120010_link_members_to_auth_users.sql


-- >>> BEGIN 202605120011_create_workouts.sql

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  notes text,
  performed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_name text not null,
  set_index integer not null check (set_index >= 1),
  reps integer not null check (reps >= 0),
  weight double precision not null default 0 check (weight >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workouts_gym_member_performed_idx
on public.workouts (gym_id, member_id, performed_at desc);

create index if not exists workouts_member_performed_idx
on public.workouts (member_id, performed_at desc);

create index if not exists workout_sets_workout_idx
on public.workout_sets (workout_id, set_index asc);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists "Users can view workouts for their gyms" on public.workouts;
create policy "Users can view workouts for their gyms"
on public.workouts
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = workouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.id = workouts.member_id
      and members.gym_id = workouts.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Users can view workout_sets for their gyms" on public.workout_sets;
create policy "Users can view workout_sets for their gyms"
on public.workout_sets
for select
to authenticated
using (
  exists (
    select 1
    from public.workouts
    left join public.gym_users
      on gym_users.gym_id = workouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
    left join public.members
      on members.id = workouts.member_id
      and members.gym_id = workouts.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
    where workouts.id = workout_sets.workout_id
      and (gym_users.id is not null or members.id is not null)
  )
);

create or replace function public.create_member_workout(
  workout_title text,
  workout_notes text,
  workout_performed_at timestamptz,
  workout_sets_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  new_workout_id uuid;
  payload_item jsonb;
  item_index integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(workout_title, '') is null then
    raise exception 'Workout title is required';
  end if;

  if jsonb_array_length(coalesce(workout_sets_payload, '[]'::jsonb)) = 0 then
    raise exception 'At least one workout set is required';
  end if;

  select *
  into current_member
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  insert into public.workouts (
    gym_id,
    member_id,
    title,
    notes,
    performed_at
  )
  values (
    current_member.gym_id,
    current_member.id,
    workout_title,
    nullif(workout_notes, ''),
    coalesce(workout_performed_at, timezone('utc', now()))
  )
  returning id into new_workout_id;

  for payload_item in
    select value from jsonb_array_elements(coalesce(workout_sets_payload, '[]'::jsonb))
  loop
    item_index := item_index + 1;

    insert into public.workout_sets (
      workout_id,
      exercise_name,
      set_index,
      reps,
      weight
    )
    values (
      new_workout_id,
      coalesce(nullif(payload_item ->> 'exercise_name', ''), 'Exercise'),
      coalesce((payload_item ->> 'set_index')::integer, item_index),
      greatest(coalesce((payload_item ->> 'reps')::integer, 0), 0),
      greatest(coalesce((payload_item ->> 'weight')::numeric, 0), 0)
    );
  end loop;

  return new_workout_id;
end;
$$;

grant execute on function public.create_member_workout(text, text, timestamptz, jsonb) to authenticated;

-- <<< END 202605120011_create_workouts.sql


-- >>> BEGIN 202605120012_create_notifications.sql

create table if not exists public.member_push_tokens (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  push_token text not null unique,
  platform text not null default 'expo' check (platform in ('expo', 'fcm')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (member_id, push_token)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  body text not null,
  type text not null check (type in ('retention', 'workout', 'billing', 'general')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists member_push_tokens_member_idx
on public.member_push_tokens (member_id, updated_at desc);

create index if not exists notifications_member_created_idx
on public.notifications (member_id, created_at desc);

create index if not exists notifications_gym_status_created_idx
on public.notifications (gym_id, status, created_at desc);

create index if not exists notifications_member_unread_idx
on public.notifications (member_id, created_at desc)
where read_at is null;

alter table public.member_push_tokens enable row level security;
alter table public.notifications enable row level security;

drop trigger if exists member_push_tokens_set_updated_at on public.member_push_tokens;
create trigger member_push_tokens_set_updated_at
before update on public.member_push_tokens
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.register_member_push_token(
  token_value text,
  token_platform text default 'expo'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  existing_token_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(token_value, '') is null then
    raise exception 'Push token is required';
  end if;

  select *
  into current_member
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  insert into public.member_push_tokens (
    gym_id,
    member_id,
    push_token,
    platform
  )
  values (
    current_member.gym_id,
    current_member.id,
    token_value,
    coalesce(nullif(token_platform, ''), 'expo')
  )
  on conflict (push_token)
  do update set
    gym_id = excluded.gym_id,
    member_id = excluded.member_id,
    platform = excluded.platform,
    updated_at = timezone('utc', now())
  returning id into existing_token_id;

  return existing_token_id;
end;
$$;

grant execute on function public.register_member_push_token(text, text) to authenticated;

create or replace function public.mark_member_notification_read(
  target_notification_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, timezone('utc', now()))
  where id = target_notification_id
    and member_id = current_member.id;

  if not found then
    raise exception 'Notification not found for this member';
  end if;

  return target_notification_id;
end;
$$;

create or replace function public.mark_all_member_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  update public.notifications
  set read_at = timezone('utc', now())
  where member_id = current_member.id
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_member_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_member_notifications_read() to authenticated;

drop policy if exists "Users can view member_push_tokens for their gyms" on public.member_push_tokens;
create policy "Users can view member_push_tokens for their gyms"
on public.member_push_tokens
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = member_push_tokens.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.id = member_push_tokens.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Users can view notifications for their gyms" on public.notifications;
create policy "Users can view notifications for their gyms"
on public.notifications
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = notifications.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.id = notifications.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Users can create notifications for their gyms" on public.notifications;
create policy "Users can create notifications for their gyms"
on public.notifications
for insert
to authenticated
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = notifications.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1 from public.members
    where members.id = notifications.member_id
      and members.gym_id = notifications.gym_id
  )
);

drop policy if exists "Users can update notifications for their gyms" on public.notifications;
create policy "Users can update notifications for their gyms"
on public.notifications
for update
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = notifications.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = notifications.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605120012_create_notifications.sql


-- >>> BEGIN 202605120013_create_community_system.sql

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  sender_member_id uuid not null references public.members (id) on delete cascade,
  receiver_member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, sender_member_id, receiver_member_id),
  check (sender_member_id <> receiver_member_id)
);

create table if not exists public.member_blocks (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  blocker_member_id uuid not null references public.members (id) on delete cascade,
  blocked_member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, blocker_member_id, blocked_member_id),
  check (blocker_member_id <> blocked_member_id)
);

create table if not exists public.member_reports (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  reporter_member_id uuid not null references public.members (id) on delete cascade,
  reported_member_id uuid not null references public.members (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  check (reporter_member_id <> reported_member_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    nullif(coalesce(body, ''), '') is not null
    or nullif(coalesce(image_url, ''), '') is not null
  )
);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, member_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists friend_requests_receiver_idx
on public.friend_requests (receiver_member_id, status, created_at desc);

create index if not exists community_posts_gym_created_idx
on public.community_posts (gym_id, created_at desc);

create index if not exists post_comments_post_created_idx
on public.post_comments (post_id, created_at asc);

alter table public.friend_requests enable row level security;
alter table public.member_blocks enable row level security;
alter table public.member_reports enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.current_member_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1
$$;

create or replace function public.current_member_gym_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select gym_id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1
$$;

create or replace function public.are_members_blocked(
  member_a uuid,
  member_b uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.member_blocks
    where (blocker_member_id = member_a and blocked_member_id = member_b)
       or (blocker_member_id = member_b and blocked_member_id = member_a)
  )
$$;

create or replace function public.are_members_friends(
  member_a uuid,
  member_b uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    member_a = member_b
    or (
      not public.are_members_blocked(member_a, member_b)
      and exists (
        select 1
        from public.friend_requests
        where status = 'accepted'
          and (
            (sender_member_id = member_a and receiver_member_id = member_b)
            or (sender_member_id = member_b and receiver_member_id = member_a)
          )
      )
    )
$$;

create or replace function public.search_gym_members(search_query text default '')
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    members.id,
    members.first_name,
    members.last_name,
    members.email
  from public.members
  where members.gym_id = public.current_member_gym_id()
    and members.id <> public.current_member_id()
    and members.status <> 'canceled'
    and not public.are_members_blocked(public.current_member_id(), members.id)
    and (
      coalesce(search_query, '') = ''
      or lower(
        concat_ws(' ', members.first_name, members.last_name, coalesce(members.email, ''))
      ) like '%' || lower(search_query) || '%'
    )
  order by members.first_name asc, members.last_name asc
  limit 12
$$;

create or replace function public.create_friend_request(target_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  if current_member.gym_id <> target_member.gym_id then
    raise exception 'Members must belong to the same gym';
  end if;

  if public.are_members_blocked(current_member.id, target_member.id) then
    raise exception 'Cannot send request to this member';
  end if;

  if public.are_members_friends(current_member.id, target_member.id) then
    raise exception 'Already connected';
  end if;

  insert into public.friend_requests (
    gym_id,
    sender_member_id,
    receiver_member_id,
    status
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id,
    'pending'
  )
  on conflict (gym_id, sender_member_id, receiver_member_id)
  do update set
    status = 'pending',
    updated_at = timezone('utc', now())
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.accept_friend_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
begin
  update public.friend_requests
  set status = 'accepted',
      updated_at = timezone('utc', now())
  where id = request_id
    and receiver_member_id = current_member_uuid
    and status = 'pending';

  return request_id;
end;
$$;

create or replace function public.create_community_post(
  post_body text,
  post_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  post_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  if current_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    image_url
  )
  values (
    current_member.gym_id,
    current_member.id,
    nullif(post_body, ''),
    nullif(post_image_url, '')
  )
  returning id into post_id;

  return post_id;
end;
$$;

create or replace function public.toggle_post_like(target_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_owner uuid;
begin
  select member_id into post_owner
  from public.community_posts
  where id = target_post_id;

  if post_owner is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_owner) then
    raise exception 'Not allowed to like this post';
  end if;

  if exists (
    select 1 from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid
  ) then
    delete from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid;

    return 'unliked';
  end if;

  insert into public.post_likes (post_id, member_id)
  values (target_post_id, current_member_uuid);

  return 'liked';
end;
$$;

create or replace function public.create_post_comment(
  target_post_id uuid,
  comment_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_owner uuid;
  comment_id uuid;
begin
  select member_id into post_owner
  from public.community_posts
  where id = target_post_id;

  if post_owner is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_owner) then
    raise exception 'Not allowed to comment on this post';
  end if;

  insert into public.post_comments (
    post_id,
    member_id,
    body
  )
  values (
    target_post_id,
    current_member_uuid,
    comment_body
  )
  returning id into comment_id;

  return comment_id;
end;
$$;

create or replace function public.block_member(target_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  block_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.member_blocks (
    gym_id,
    blocker_member_id,
    blocked_member_id
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id
  )
  on conflict (gym_id, blocker_member_id, blocked_member_id)
  do nothing
  returning id into block_id;

  return block_id;
end;
$$;

create or replace function public.report_member(
  target_member_id uuid,
  report_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  report_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.member_reports (
    gym_id,
    reporter_member_id,
    reported_member_id,
    reason
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id,
    report_reason
  )
  returning id into report_id;

  return report_id;
end;
$$;

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_gym_id() to authenticated;
grant execute on function public.are_members_blocked(uuid, uuid) to authenticated;
grant execute on function public.are_members_friends(uuid, uuid) to authenticated;
grant execute on function public.search_gym_members(text) to authenticated;
grant execute on function public.create_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.create_community_post(text, text) to authenticated;
grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.create_post_comment(uuid, text) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.report_member(uuid, text) to authenticated;

drop policy if exists "Members can view their own friend requests" on public.friend_requests;
create policy "Members can view their own friend requests"
on public.friend_requests
for select
to authenticated
using (
  sender_member_id = public.current_member_id()
  or receiver_member_id = public.current_member_id()
);

drop policy if exists "Members can view blocks involving them" on public.member_blocks;
create policy "Members can view blocks involving them"
on public.member_blocks
for select
to authenticated
using (
  blocker_member_id = public.current_member_id()
  or blocked_member_id = public.current_member_id()
);

drop policy if exists "Members can view their own reports" on public.member_reports;
create policy "Members can view their own reports"
on public.member_reports
for select
to authenticated
using (
  reporter_member_id = public.current_member_id()
);

drop policy if exists "Members can view friends-only posts" on public.community_posts;
create policy "Members can view friends-only posts"
on public.community_posts
for select
to authenticated
using (
  gym_id = public.current_member_gym_id()
  and public.are_members_friends(public.current_member_id(), member_id)
);

drop policy if exists "Members can view likes on visible posts" on public.post_likes;
create policy "Members can view likes on visible posts"
on public.post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_likes.post_id
      and public.are_members_friends(public.current_member_id(), community_posts.member_id)
  )
);

drop policy if exists "Members can view comments on visible posts" on public.post_comments;
create policy "Members can view comments on visible posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_comments.post_id
      and public.are_members_friends(public.current_member_id(), community_posts.member_id)
  )
);

-- <<< END 202605120013_create_community_system.sql


-- >>> BEGIN 202605120014_enhance_community_engagement.sql

alter table public.community_posts
add column if not exists visibility text not null default 'friends_only'
check (visibility in ('friends_only', 'gym_feed'));

alter table public.community_posts
add column if not exists is_auto_generated boolean not null default false;

alter table public.community_posts
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.post_likes
add column if not exists reaction text not null default '🔥'
check (reaction in ('🔥', '💪', '👏'));

create index if not exists community_posts_gym_visibility_created_idx
on public.community_posts (gym_id, visibility, created_at desc);

create index if not exists post_likes_post_reaction_idx
on public.post_likes (post_id, reaction);

create or replace function public.member_current_check_in_streak(target_member_id uuid)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  unique_days date[];
  today_date date := current_date;
  comparison_date date;
  streak integer := 0;
  day_index integer := 1;
begin
  select coalesce(array_agg(distinct (created_at at time zone 'utc')::date order by (created_at at time zone 'utc')::date desc), '{}'::date[])
  into unique_days
  from public.check_ins
  where member_id = target_member_id;

  if coalesce(array_length(unique_days, 1), 0) = 0 then
    return 0;
  end if;

  if unique_days[1] = today_date then
    streak := 1;
    day_index := 2;
  elsif unique_days[1] = today_date - 1 then
    streak := 1;
    day_index := 2;
  else
    return 0;
  end if;

  while day_index <= coalesce(array_length(unique_days, 1), 0) loop
    comparison_date := unique_days[day_index - 1] - 1;

    if unique_days[day_index] <> comparison_date then
      exit;
    end if;

    streak := streak + 1;
    day_index := day_index + 1;
  end loop;

  return streak;
end;
$$;

create or replace function public.create_community_post(
  post_body text,
  post_image_url text,
  post_visibility text default 'friends_only'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  normalized_visibility text := coalesce(nullif(post_visibility, ''), 'friends_only');
  post_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  if current_member.id is null then
    raise exception 'Member not found';
  end if;

  if normalized_visibility not in ('friends_only', 'gym_feed') then
    raise exception 'Invalid post visibility';
  end if;

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    image_url,
    visibility
  )
  values (
    current_member.gym_id,
    current_member.id,
    nullif(post_body, ''),
    nullif(post_image_url, ''),
    normalized_visibility
  )
  returning id into post_id;

  return post_id;
end;
$$;

create or replace function public.react_to_post(
  target_post_id uuid,
  reaction_value text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_record public.community_posts%rowtype;
  normalized_reaction text := coalesce(nullif(reaction_value, ''), '🔥');
begin
  if normalized_reaction not in ('🔥', '💪', '👏') then
    raise exception 'Invalid reaction';
  end if;

  select *
  into post_record
  from public.community_posts
  where id = target_post_id;

  if post_record.id is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_record.member_id) then
    raise exception 'Not allowed to react to this post';
  end if;

  if exists (
    select 1
    from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid
      and reaction = normalized_reaction
  ) then
    delete from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid;

    return 'removed';
  end if;

  insert into public.post_likes (post_id, member_id, reaction)
  values (target_post_id, current_member_uuid, normalized_reaction)
  on conflict (post_id, member_id)
  do update set
    reaction = excluded.reaction,
    created_at = timezone('utc', now());

  return 'reacted';
end;
$$;

create or replace function public.create_check_in_milestone_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_record public.members%rowtype;
  total_check_ins integer;
  current_streak integer;
  milestone integer;
  milestone_message text;
begin
  select *
  into member_record
  from public.members
  where id = new.member_id;

  if member_record.id is null then
    return new;
  end if;

  select count(*)
  into total_check_ins
  from public.check_ins
  where member_id = new.member_id;

  if total_check_ins not in (5, 10, 30) then
    return new;
  end if;

  milestone := total_check_ins;

  if exists (
    select 1
    from public.community_posts
    where member_id = new.member_id
      and is_auto_generated = true
      and metadata ->> 'type' = 'check_in_milestone'
      and metadata ->> 'milestone' = milestone::text
  ) then
    return new;
  end if;

  current_streak := public.member_current_check_in_streak(new.member_id);
  milestone_message := trim(
    format(
      '%s just hit %s check-ins%s 🔥',
      member_record.first_name,
      milestone,
      case
        when current_streak > 0 then format(' and is on a %s-day streak', current_streak)
        else ''
      end
    )
  );

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    visibility,
    is_auto_generated,
    metadata
  )
  values (
    member_record.gym_id,
    new.member_id,
    milestone_message,
    'friends_only',
    true,
    jsonb_build_object(
      'type', 'check_in_milestone',
      'milestone', milestone,
      'streak', current_streak
    )
  );

  return new;
end;
$$;

drop trigger if exists create_check_in_milestone_post on public.check_ins;
create trigger create_check_in_milestone_post
after insert on public.check_ins
for each row
execute function public.create_check_in_milestone_post();

grant execute on function public.member_current_check_in_streak(uuid) to authenticated;
grant execute on function public.create_community_post(text, text, text) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;

revoke execute on function public.create_community_post(text, text) from authenticated;
revoke execute on function public.toggle_post_like(uuid) from authenticated;

drop function if exists public.create_community_post(text, text);
drop function if exists public.toggle_post_like(uuid);

drop policy if exists "Members can view friends-only posts" on public.community_posts;
create policy "Members can view community posts in scope"
on public.community_posts
for select
to authenticated
using (
  gym_id = public.current_member_gym_id()
  and not public.are_members_blocked(public.current_member_id(), member_id)
  and (
    visibility = 'gym_feed'
    or public.are_members_friends(public.current_member_id(), member_id)
  )
);

drop policy if exists "Members can view likes on visible posts" on public.post_likes;
create policy "Members can view likes on visible posts"
on public.post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_likes.post_id
      and community_posts.gym_id = public.current_member_gym_id()
      and not public.are_members_blocked(public.current_member_id(), community_posts.member_id)
      and (
        community_posts.visibility = 'gym_feed'
        or public.are_members_friends(public.current_member_id(), community_posts.member_id)
      )
  )
);

drop policy if exists "Members can view comments on visible posts" on public.post_comments;
create policy "Members can view comments on visible posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_comments.post_id
      and community_posts.gym_id = public.current_member_gym_id()
      and not public.are_members_blocked(public.current_member_id(), community_posts.member_id)
      and (
        community_posts.visibility = 'gym_feed'
        or public.are_members_friends(public.current_member_id(), community_posts.member_id)
      )
  )
);

-- <<< END 202605120014_enhance_community_engagement.sql


-- >>> BEGIN 202605120015_add_stripe_billing.sql

alter table public.gyms
add column if not exists stripe_connected_account_id text,
add column if not exists stripe_onboarding_completed boolean not null default false,
add column if not exists stripe_charges_enabled boolean not null default false,
add column if not exists stripe_payouts_enabled boolean not null default false,
add column if not exists stripe_details_submitted boolean not null default false;

alter table public.members
add column if not exists stripe_customer_id text;

create unique index if not exists gyms_stripe_connected_account_id_key
on public.gyms (stripe_connected_account_id)
where stripe_connected_account_id is not null;

create unique index if not exists members_stripe_customer_id_key
on public.members (stripe_customer_id)
where stripe_customer_id is not null;

create unique index if not exists membership_plans_stripe_price_id_key
on public.membership_plans (stripe_price_id)
where stripe_price_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_key
on public.subscriptions (stripe_subscription_id)
where stripe_subscription_id is not null;

create unique index if not exists payments_stripe_invoice_id_key
on public.payments (stripe_invoice_id)
where stripe_invoice_id is not null;

create index if not exists payments_stripe_payment_intent_id_idx
on public.payments (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

-- <<< END 202605120015_add_stripe_billing.sql


-- >>> BEGIN 202605120016_hardening_and_idempotency.sql

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.stripe_webhook_events enable row level security;

create unique index if not exists subscriptions_single_live_subscription_per_member_idx
on public.subscriptions (gym_id, member_id)
where status in ('active', 'trialing', 'past_due');

create unique index if not exists payments_stripe_payment_intent_id_key
on public.payments (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

-- <<< END 202605120016_hardening_and_idempotency.sql


-- >>> BEGIN 202605140001_add_friend_step_leaderboard.sql

create or replace function public.fetch_friend_step_leaderboard(
  leaderboard_limit integer default 5
)
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  step_count integer,
  rank integer
)
language sql
security definer
stable
set search_path = public
as $$
  with current_member as (
    select
      public.current_member_id() as member_id,
      public.current_member_gym_id() as gym_id
  ),
  friend_members as (
    select distinct
      case
        when friend_requests.sender_member_id = current_member.member_id
          then friend_requests.receiver_member_id
        else friend_requests.sender_member_id
      end as member_id
    from public.friend_requests
    cross join current_member
    where friend_requests.status = 'accepted'
      and friend_requests.gym_id = current_member.gym_id
      and (
        friend_requests.sender_member_id = current_member.member_id
        or friend_requests.receiver_member_id = current_member.member_id
      )
  ),
  today_check_ins as (
    select
      check_ins.member_id,
      count(*)::integer as check_ins_today
    from public.check_ins
    where check_ins.created_at at time zone 'utc' >= date_trunc('day', timezone('utc', now()))
      and check_ins.created_at at time zone 'utc' < date_trunc('day', timezone('utc', now())) + interval '1 day'
    group by check_ins.member_id
  ),
  today_workouts as (
    select
      workouts.member_id,
      count(*)::integer as workouts_today
    from public.workouts
    where workouts.performed_at at time zone 'utc' >= date_trunc('day', timezone('utc', now()))
      and workouts.performed_at at time zone 'utc' < date_trunc('day', timezone('utc', now())) + interval '1 day'
    group by workouts.member_id
  ),
  scored as (
    select
      members.id as member_id,
      members.first_name,
      members.last_name,
      greatest(
        coalesce(today_check_ins.check_ins_today, 0) * 1700
        + coalesce(today_workouts.workouts_today, 0) * 2600,
        0
      )::integer as step_count
    from friend_members
    join current_member on true
    join public.members
      on members.id = friend_members.member_id
    left join today_check_ins
      on today_check_ins.member_id = members.id
    left join today_workouts
      on today_workouts.member_id = members.id
    where members.gym_id = current_member.gym_id
      and members.status <> 'canceled'
  )
  select
    scored.member_id,
    scored.first_name,
    scored.last_name,
    scored.step_count,
    row_number() over (
      order by scored.step_count desc, scored.first_name asc, scored.last_name asc
    )::integer as rank
  from scored
  order by scored.step_count desc, scored.first_name asc, scored.last_name asc
  limit greatest(coalesce(leaderboard_limit, 5), 1);
$$;

grant execute on function public.fetch_friend_step_leaderboard(integer) to authenticated;

-- <<< END 202605140001_add_friend_step_leaderboard.sql


-- >>> BEGIN 202605150001_create_gym_announcements.sql

create table if not exists public.gym_announcements (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists gym_announcements_gym_active_created_idx
on public.gym_announcements (gym_id, is_active, is_pinned desc, created_at desc);

alter table public.gym_announcements enable row level security;

drop trigger if exists gym_announcements_set_updated_at on public.gym_announcements;
create trigger gym_announcements_set_updated_at
before update on public.gym_announcements
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view announcements for their gyms" on public.gym_announcements;
create policy "Users can view announcements for their gyms"
on public.gym_announcements
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_announcements.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = gym_announcements.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Users can insert announcements for their gyms" on public.gym_announcements;
create policy "Users can insert announcements for their gyms"
on public.gym_announcements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_announcements.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can update announcements for their gyms" on public.gym_announcements;
create policy "Users can update announcements for their gyms"
on public.gym_announcements
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_announcements.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_announcements.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605150001_create_gym_announcements.sql


-- >>> BEGIN 202605150002_create_smart_fridge_wallet.sql

create table if not exists public.fridge_products (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_unlock_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  selected_items jsonb not null default '[]'::jsonb,
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'unlocked', 'confirmed', 'expired', 'canceled')),
  qr_token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_access_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  fridge_unlock_session_id uuid not null references public.fridge_unlock_sessions (id) on delete cascade,
  fridge_label text not null default 'Smart Fridge',
  selected_items jsonb not null default '[]'::jsonb,
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  status text not null check (status in ('pending', 'unlocked', 'confirmed', 'expired', 'canceled')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_orders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  fridge_unlock_session_id uuid not null unique references public.fridge_unlock_sessions (id) on delete cascade,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  stripe_payment_intent_id text,
  receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_order_items (
  id uuid primary key default gen_random_uuid(),
  fridge_order_id uuid not null references public.fridge_orders (id) on delete cascade,
  product_id uuid references public.fridge_products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_price_cents integer not null check (total_price_cents >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.members
add column if not exists stripe_default_payment_method_id text;

create index if not exists fridge_products_gym_active_sort_idx
on public.fridge_products (gym_id, is_active, sort_order asc, created_at desc);

create index if not exists fridge_unlock_sessions_member_created_idx
on public.fridge_unlock_sessions (member_id, created_at desc);

create index if not exists fridge_unlock_sessions_gym_status_expires_idx
on public.fridge_unlock_sessions (gym_id, status, expires_at asc);

create index if not exists fridge_access_events_gym_created_idx
on public.fridge_access_events (gym_id, created_at desc);

create index if not exists fridge_access_events_member_created_idx
on public.fridge_access_events (member_id, created_at desc);

create index if not exists fridge_orders_member_created_idx
on public.fridge_orders (member_id, created_at desc);

create index if not exists fridge_orders_gym_status_created_idx
on public.fridge_orders (gym_id, status, created_at desc);

create index if not exists fridge_order_items_order_idx
on public.fridge_order_items (fridge_order_id, created_at asc);

alter table public.fridge_products enable row level security;
alter table public.fridge_unlock_sessions enable row level security;
alter table public.fridge_access_events enable row level security;
alter table public.fridge_orders enable row level security;
alter table public.fridge_order_items enable row level security;

drop trigger if exists fridge_products_set_updated_at on public.fridge_products;
create trigger fridge_products_set_updated_at
before update on public.fridge_products
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view fridge products for their gyms" on public.fridge_products;
create policy "Users can view fridge products for their gyms"
on public.fridge_products
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = fridge_products.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Staff can manage fridge products for their gyms" on public.fridge_products;
create policy "Staff can manage fridge products for their gyms"
on public.fridge_products
for all
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge sessions" on public.fridge_unlock_sessions;
create policy "Members can view their own fridge sessions"
on public.fridge_unlock_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_unlock_sessions.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_unlock_sessions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge access events" on public.fridge_access_events;
create policy "Members can view their own fridge access events"
on public.fridge_access_events
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_access_events.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_access_events.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge orders" on public.fridge_orders;
create policy "Members can view their own fridge orders"
on public.fridge_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_orders.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_orders.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge order items" on public.fridge_order_items;
create policy "Members can view their own fridge order items"
on public.fridge_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.fridge_orders
    join public.members
      on members.id = fridge_orders.member_id
    where fridge_orders.id = fridge_order_items.fridge_order_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.fridge_orders
    join public.gym_users
      on gym_users.gym_id = fridge_orders.gym_id
    where fridge_orders.id = fridge_order_items.fridge_order_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605150002_create_smart_fridge_wallet.sql


-- >>> BEGIN 202605150003_create_fridge_unlock_rpc.sql

create or replace function public.create_member_fridge_unlock_session(
  selected_items_payload jsonb,
  expires_in_seconds integer default 90
)
returns table (
  id uuid,
  gym_id uuid,
  member_id uuid,
  selected_items jsonb,
  estimated_total_cents integer,
  status text,
  qr_token text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  payload_item jsonb;
  product_row public.fridge_products%rowtype;
  quantity_value integer;
  safe_expiry_seconds integer := greatest(60, least(coalesce(expires_in_seconds, 90), 120));
  session_selected_items jsonb := '[]'::jsonb;
  session_total_cents integer := 0;
  generated_qr_token text := md5(
    auth.uid()::text || ':' || clock_timestamp()::text || ':' || random()::text
  );
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_typeof(coalesce(selected_items_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(selected_items_payload, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one item before unlocking the fridge.';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  for payload_item in
    select value from jsonb_array_elements(selected_items_payload)
  loop
    quantity_value := greatest(coalesce((payload_item ->> 'quantity')::integer, 0), 0);

    if quantity_value <= 0 then
      continue;
    end if;

    select *
    into product_row
    from public.fridge_products
    where fridge_products.id = (payload_item ->> 'productId')::uuid
      and fridge_products.gym_id = current_member.gym_id
      and fridge_products.is_active = true
    limit 1;

    if product_row.id is null then
      raise exception 'One or more selected products are no longer available.';
    end if;

    session_selected_items := session_selected_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', product_row.id,
        'name', product_row.name,
        'quantity', quantity_value,
        'unit_price_cents', product_row.price_cents,
        'total_price_cents', product_row.price_cents * quantity_value
      )
    );
    session_total_cents := session_total_cents + (product_row.price_cents * quantity_value);
  end loop;

  if session_total_cents <= 0 then
    raise exception 'Select at least one valid item before unlocking the fridge.';
  end if;

  return query
  insert into public.fridge_unlock_sessions (
    gym_id,
    member_id,
    selected_items,
    estimated_total_cents,
    status,
    qr_token,
    expires_at
  )
  values (
    current_member.gym_id,
    current_member.id,
    session_selected_items,
    session_total_cents,
    'pending',
    generated_qr_token,
    timezone('utc', now()) + make_interval(secs => safe_expiry_seconds)
  )
  returning
    fridge_unlock_sessions.id,
    fridge_unlock_sessions.gym_id,
    fridge_unlock_sessions.member_id,
    fridge_unlock_sessions.selected_items,
    fridge_unlock_sessions.estimated_total_cents,
    fridge_unlock_sessions.status,
    fridge_unlock_sessions.qr_token,
    fridge_unlock_sessions.expires_at,
    fridge_unlock_sessions.created_at;
end;
$$;

grant execute on function public.create_member_fridge_unlock_session(jsonb, integer) to authenticated;

create index if not exists members_gym_created_at_idx
on public.members (gym_id, created_at desc);

create index if not exists members_gym_status_created_at_idx
on public.members (gym_id, status, created_at desc);

create index if not exists members_gym_name_idx
on public.members (gym_id, first_name, last_name);

create index if not exists subscriptions_gym_member_created_idx
on public.subscriptions (gym_id, member_id, created_at desc);

create index if not exists notifications_gym_member_created_idx
on public.notifications (gym_id, member_id, created_at desc);

create index if not exists ai_insights_gym_status_priority_created_idx
on public.ai_insights (gym_id, status, priority, created_at desc);

create index if not exists check_ins_gym_member_created_at_idx
on public.check_ins (gym_id, member_id, created_at desc);

create index if not exists fridge_access_events_gym_status_created_idx
on public.fridge_access_events (gym_id, status, created_at desc);

create or replace function public.get_latest_member_check_ins_for_gym(
  p_gym_id uuid
)
returns table (
  member_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (check_ins.member_id)
    check_ins.member_id,
    check_ins.created_at
  from public.check_ins
  where check_ins.gym_id = p_gym_id
  order by check_ins.member_id, check_ins.created_at desc
$$;

grant execute on function public.get_latest_member_check_ins_for_gym(uuid) to authenticated;

create or replace function public.get_latest_member_notifications_for_gym(
  p_gym_id uuid
)
returns table (
  member_id uuid,
  title text,
  type text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (notifications.member_id)
    notifications.member_id,
    notifications.title,
    notifications.type,
    notifications.created_at
  from public.notifications
  where notifications.gym_id = p_gym_id
  order by notifications.member_id, notifications.created_at desc
$$;

grant execute on function public.get_latest_member_notifications_for_gym(uuid) to authenticated;

-- <<< END 202605150003_create_fridge_unlock_rpc.sql


-- >>> BEGIN 202605190002_create_member_app_bootstrap_rpc.sql

drop function if exists public.get_member_app_bootstrap(integer, integer, integer);

create function public.get_member_app_bootstrap(
  notifications_limit integer default 12,
  announcements_limit integer default 6,
  recent_checkins_limit integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  member_row public.members%rowtype;
  gym_row public.gyms%rowtype;
  total_visits integer := 0;
  recent_checkins jsonb := '[]'::jsonb;
  recent_notifications jsonb := '[]'::jsonb;
  recent_announcements jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    return null;
  end if;

  select *
  into member_row
  from public.members
  where user_id = current_user_id
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if member_row.id is null then
    return null;
  end if;

  select *
  into gym_row
  from public.gyms
  where id = member_row.gym_id
  limit 1;

  select count(*)
  into total_visits
  from public.check_ins
  where gym_id = member_row.gym_id
    and member_id = member_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'check_in_method', c.check_in_method
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_checkins
  from (
    select id, created_at, check_in_method
    from public.check_ins
    where gym_id = member_row.gym_id
      and member_id = member_row.id
    order by created_at desc
    limit greatest(recent_checkins_limit, 1)
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'body', n.body,
        'type', n.type,
        'status', n.status,
        'created_at', n.created_at,
        'read_at', n.read_at
      )
      order by n.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_notifications
  from (
    select id, title, body, type, status, created_at, read_at
    from public.notifications
    where member_id = member_row.id
    order by created_at desc
    limit greatest(notifications_limit, 1)
  ) n;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'gym_id', a.gym_id,
        'title', a.title,
        'body', a.body,
        'is_pinned', a.is_pinned,
        'is_active', a.is_active,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
      order by a.is_pinned desc, a.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_announcements
  from (
    select id, gym_id, title, body, is_pinned, is_active, created_at, updated_at
    from public.gym_announcements
    where gym_id = member_row.gym_id
      and is_active = true
    order by is_pinned desc, created_at desc
    limit greatest(announcements_limit, 1)
  ) a;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'id', member_row.id,
      'gym_id', member_row.gym_id,
      'user_id', member_row.user_id,
      'first_name', member_row.first_name,
      'last_name', member_row.last_name,
      'email', member_row.email,
      'phone', member_row.phone,
      'status', member_row.status,
      'frozen_until', member_row.frozen_until,
      'canceled_at', member_row.canceled_at,
      'joined_at', member_row.joined_at
    ),
    'gym', case
      when gym_row.id is null then null
      else jsonb_build_object(
        'id', gym_row.id,
        'name', gym_row.name,
        'slug', gym_row.slug,
        'timezone', gym_row.timezone
      )
    end,
    'stats', jsonb_build_object(
      'totalVisits', total_visits,
      'lastCheckInAt', coalesce(recent_checkins -> 0 ->> 'created_at', null)
    ),
    'recentCheckIns', recent_checkins,
    'notifications', recent_notifications,
    'announcements', recent_announcements
  );
end;
$$;

grant execute on function public.get_member_app_bootstrap(integer, integer, integer) to authenticated;

-- <<< END 202605190002_create_member_app_bootstrap_rpc.sql


-- >>> BEGIN 202605160001_add_fridge_product_categories.sql

alter table public.fridge_products
add column if not exists category text not null default 'drinks_fridge';

alter table public.fridge_products
drop constraint if exists fridge_products_category_check;

alter table public.fridge_products
add constraint fridge_products_category_check
check (
  category in (
    'drinks_fridge',
    'meal_prep_fridge',
    'protein_candy',
    'tclc_merch'
  )
);

create index if not exists fridge_products_gym_category_active_idx
on public.fridge_products (gym_id, category, is_active, sort_order asc, created_at desc);

-- <<< END 202605160001_add_fridge_product_categories.sql


-- >>> BEGIN 202605160002_add_member_billing_controls.sql

alter table public.members
add column if not exists frozen_until date,
add column if not exists canceled_at timestamptz;

create index if not exists members_status_frozen_until_idx
on public.members (status, frozen_until);

-- <<< END 202605160002_add_member_billing_controls.sql


-- >>> BEGIN 202605160003_create_member_billing_summary_rpc.sql

drop function if exists public.get_member_billing_summary();

create function public.get_member_billing_summary()
returns table (
  membership_status text,
  billing_cycle text,
  membership_plan_name text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  has_card_on_file boolean,
  card_brand text,
  card_last4 text,
  frozen_until date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  return query
  select
    current_member.status as membership_status,
    membership_plans.billing_interval::text as billing_cycle,
    membership_plans.name as membership_plan_name,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
    null::text as card_brand,
    null::text as card_last4,
    current_member.frozen_until
  from public.subscriptions
  left join public.membership_plans
    on membership_plans.id = subscriptions.membership_plan_id
  where subscriptions.gym_id = current_member.gym_id
    and subscriptions.member_id = current_member.id
  order by subscriptions.created_at desc
  limit 1;

  if not found then
    return query
    select
      current_member.status as membership_status,
      null::text as billing_cycle,
      null::text as membership_plan_name,
      null::timestamptz as current_period_start,
      null::timestamptz as current_period_end,
      (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
      null::text as card_brand,
      null::text as card_last4,
      current_member.frozen_until;
  end if;
end;
$$;

grant execute on function public.get_member_billing_summary() to authenticated;

-- <<< END 202605160003_create_member_billing_summary_rpc.sql


-- >>> BEGIN 202605160011_expand_member_billing_summary.sql

create or replace function public.get_member_billing_summary()
returns table (
  membership_status text,
  billing_cycle text,
  membership_plan_name text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  has_card_on_file boolean,
  card_brand text,
  card_last4 text,
  frozen_until date,
  gym_billing_ready boolean,
  gym_billing_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  current_gym public.gyms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  select *
  into current_gym
  from public.gyms
  where gyms.id = current_member.gym_id;

  return query
  select
    current_member.status as membership_status,
    membership_plans.billing_interval::text as billing_cycle,
    membership_plans.name as membership_plan_name,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
    null::text as card_brand,
    null::text as card_last4,
    current_member.frozen_until,
    (
      current_gym.stripe_connected_account_id is not null
      and current_gym.stripe_charges_enabled = true
    ) as gym_billing_ready,
    case
      when current_gym.stripe_connected_account_id is null then 'Gym billing is not connected yet.'
      when current_gym.stripe_charges_enabled = false then 'Gym billing setup is still incomplete.'
      else null::text
    end as gym_billing_message
  from public.subscriptions
  left join public.membership_plans
    on membership_plans.id = subscriptions.membership_plan_id
  where subscriptions.gym_id = current_member.gym_id
    and subscriptions.member_id = current_member.id
  order by subscriptions.created_at desc
  limit 1;

  if not found then
    return query
    select
      current_member.status as membership_status,
      null::text as billing_cycle,
      null::text as membership_plan_name,
      null::timestamptz as current_period_start,
      null::timestamptz as current_period_end,
      (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
      null::text as card_brand,
      null::text as card_last4,
      current_member.frozen_until,
      (
        current_gym.stripe_connected_account_id is not null
        and current_gym.stripe_charges_enabled = true
      ) as gym_billing_ready,
      case
        when current_gym.stripe_connected_account_id is null then 'Gym billing is not connected yet.'
        when current_gym.stripe_charges_enabled = false then 'Gym billing setup is still incomplete.'
        else null::text
      end as gym_billing_message;
  end if;
end;
$$;

grant execute on function public.get_member_billing_summary() to authenticated;

-- <<< END 202605160011_expand_member_billing_summary.sql

-- >>> BEGIN 202605180001_refine_member_billing_status_messages.sql

drop function if exists public.get_member_billing_summary();

create function public.get_member_billing_summary()
returns table (
  membership_status text,
  billing_cycle text,
  membership_plan_name text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  has_card_on_file boolean,
  card_brand text,
  card_last4 text,
  frozen_until date,
  gym_billing_ready boolean,
  gym_billing_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  current_gym public.gyms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  select *
  into current_gym
  from public.gyms
  where gyms.id = current_member.gym_id;

  return query
  select
    current_member.status as membership_status,
    membership_plans.billing_interval::text as billing_cycle,
    membership_plans.name as membership_plan_name,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
    null::text as card_brand,
    null::text as card_last4,
    current_member.frozen_until,
    (
      current_gym.stripe_connected_account_id is not null
      and current_gym.stripe_charges_enabled = true
    ) as gym_billing_ready,
    case
      when current_gym.stripe_connected_account_id is null then 'Gym billing is not connected yet. Staff still needs to enable Stripe Connect and finish setup.'
      when current_gym.stripe_onboarding_completed = false then 'Gym Stripe onboarding is still incomplete. Ask staff to finish the Stripe onboarding flow.'
      when current_gym.stripe_charges_enabled = false then 'Gym billing is connected, but charges are not enabled yet.'
      else null::text
    end as gym_billing_message
  from public.subscriptions
  left join public.membership_plans
    on membership_plans.id = subscriptions.membership_plan_id
  where subscriptions.gym_id = current_member.gym_id
    and subscriptions.member_id = current_member.id
  order by subscriptions.created_at desc
  limit 1;

  if not found then
    return query
    select
      current_member.status as membership_status,
      null::text as billing_cycle,
      null::text as membership_plan_name,
      null::timestamptz as current_period_start,
      null::timestamptz as current_period_end,
      (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
      null::text as card_brand,
      null::text as card_last4,
      current_member.frozen_until,
      (
        current_gym.stripe_connected_account_id is not null
        and current_gym.stripe_charges_enabled = true
      ) as gym_billing_ready,
      case
        when current_gym.stripe_connected_account_id is null then 'Gym billing is not connected yet. Staff still needs to enable Stripe Connect and finish setup.'
        when current_gym.stripe_onboarding_completed = false then 'Gym Stripe onboarding is still incomplete. Ask staff to finish the Stripe onboarding flow.'
        when current_gym.stripe_charges_enabled = false then 'Gym billing is connected, but charges are not enabled yet.'
        else null::text
      end as gym_billing_message;
  end if;
end;
$$;

grant execute on function public.get_member_billing_summary() to authenticated;

-- <<< END 202605180001_refine_member_billing_status_messages.sql


-- >>> BEGIN 202605160006_create_member_notes.sql

create table if not exists public.member_notes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists member_notes_gym_member_created_idx
on public.member_notes (gym_id, member_id, created_at desc);

create index if not exists member_notes_gym_archived_created_idx
on public.member_notes (gym_id, is_archived, created_at desc);

alter table public.member_notes enable row level security;

drop trigger if exists member_notes_set_updated_at on public.member_notes;
create trigger member_notes_set_updated_at
before update on public.member_notes
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists member_notes_select_by_gym on public.member_notes;
create policy member_notes_select_by_gym
on public.member_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_notes.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists member_notes_insert_by_gym on public.member_notes;
create policy member_notes_insert_by_gym
on public.member_notes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_notes.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists member_notes_update_by_gym on public.member_notes;
create policy member_notes_update_by_gym
on public.member_notes
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_notes.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_notes.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605160006_create_member_notes.sql


-- >>> BEGIN 202605160007_create_member_follow_up_tasks.sql

create table if not exists public.member_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  details text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'completed')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists member_follow_up_tasks_gym_member_status_due_idx
on public.member_follow_up_tasks (gym_id, member_id, status, due_at asc nulls last, created_at desc);

create index if not exists member_follow_up_tasks_gym_status_priority_idx
on public.member_follow_up_tasks (gym_id, status, priority, created_at desc);

alter table public.member_follow_up_tasks enable row level security;

drop trigger if exists member_follow_up_tasks_set_updated_at on public.member_follow_up_tasks;
create trigger member_follow_up_tasks_set_updated_at
before update on public.member_follow_up_tasks
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists member_follow_up_tasks_select_by_gym on public.member_follow_up_tasks;
create policy member_follow_up_tasks_select_by_gym
on public.member_follow_up_tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_follow_up_tasks.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists member_follow_up_tasks_insert_by_gym on public.member_follow_up_tasks;
create policy member_follow_up_tasks_insert_by_gym
on public.member_follow_up_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_follow_up_tasks.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists member_follow_up_tasks_update_by_gym on public.member_follow_up_tasks;
create policy member_follow_up_tasks_update_by_gym
on public.member_follow_up_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_follow_up_tasks.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_follow_up_tasks.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605160007_create_member_follow_up_tasks.sql


-- >>> BEGIN 202605160008_add_member_follow_up_task_types.sql

alter table public.member_follow_up_tasks
add column if not exists task_type text not null default 'general';

alter table public.member_follow_up_tasks
drop constraint if exists member_follow_up_tasks_task_type_check;

alter table public.member_follow_up_tasks
add constraint member_follow_up_tasks_task_type_check
check (task_type in ('general', 'billing', 'retention', 'front_desk'));

create index if not exists member_follow_up_tasks_gym_type_status_idx
on public.member_follow_up_tasks (gym_id, task_type, status, priority, created_at desc);

-- <<< END 202605160008_add_member_follow_up_task_types.sql


-- >>> BEGIN 202605160009_create_gym_challenges.sql

create table if not exists public.gym_challenges (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  title text not null,
  description text,
  metric_type text not null check (metric_type in ('steps', 'visits', 'workouts')),
  goal_value integer not null check (goal_value > 0),
  period text not null check (period in ('weekly', 'monthly')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_on >= starts_on)
);

create index if not exists gym_challenges_gym_status_dates_idx
on public.gym_challenges (gym_id, status, starts_on desc, ends_on desc);

alter table public.gym_challenges enable row level security;

drop trigger if exists gym_challenges_set_updated_at on public.gym_challenges;
create trigger gym_challenges_set_updated_at
before update on public.gym_challenges
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists gym_challenges_staff_select on public.gym_challenges;
create policy gym_challenges_staff_select
on public.gym_challenges
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_challenges.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = gym_challenges.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
      and gym_challenges.status = 'active'
  )
);

drop policy if exists gym_challenges_staff_insert on public.gym_challenges;
create policy gym_challenges_staff_insert
on public.gym_challenges
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_challenges.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists gym_challenges_staff_update on public.gym_challenges;
create policy gym_challenges_staff_update
on public.gym_challenges
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_challenges.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_challenges.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605160009_create_gym_challenges.sql


-- >>> BEGIN 202605160010_create_gym_culture_feed.sql

create table if not exists public.gym_shoutouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  title text not null,
  body text not null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  is_pinned boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gym_member_spotlights (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists gym_shoutouts_gym_created_idx
on public.gym_shoutouts (gym_id, is_pinned desc, created_at desc);

create index if not exists gym_member_spotlights_gym_status_created_idx
on public.gym_member_spotlights (gym_id, status, created_at desc);

alter table public.gym_shoutouts enable row level security;
alter table public.gym_member_spotlights enable row level security;

drop policy if exists gym_shoutouts_select_by_scope on public.gym_shoutouts;
create policy gym_shoutouts_select_by_scope
on public.gym_shoutouts
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_shoutouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = gym_shoutouts.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
      and (gym_shoutouts.expires_at is null or gym_shoutouts.expires_at >= timezone('utc', now()))
  )
);

drop policy if exists gym_shoutouts_insert_by_staff on public.gym_shoutouts;
create policy gym_shoutouts_insert_by_staff
on public.gym_shoutouts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_shoutouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists gym_member_spotlights_select_by_scope on public.gym_member_spotlights;
create policy gym_member_spotlights_select_by_scope
on public.gym_member_spotlights
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_member_spotlights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = gym_member_spotlights.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
      and gym_member_spotlights.status = 'active'
  )
);

drop policy if exists gym_member_spotlights_insert_by_staff on public.gym_member_spotlights;
create policy gym_member_spotlights_insert_by_staff
on public.gym_member_spotlights
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_member_spotlights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists gym_member_spotlights_update_by_staff on public.gym_member_spotlights;
create policy gym_member_spotlights_update_by_staff
on public.gym_member_spotlights
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_member_spotlights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = gym_member_spotlights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

-- <<< END 202605160010_create_gym_culture_feed.sql



create unique index if not exists fridge_unlock_sessions_qr_token_idx
on public.fridge_unlock_sessions (qr_token);

