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
