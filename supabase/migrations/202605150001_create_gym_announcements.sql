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
