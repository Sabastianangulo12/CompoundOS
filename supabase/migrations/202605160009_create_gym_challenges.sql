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
