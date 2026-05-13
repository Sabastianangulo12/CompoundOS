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
