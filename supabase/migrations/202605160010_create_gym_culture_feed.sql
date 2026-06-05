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
