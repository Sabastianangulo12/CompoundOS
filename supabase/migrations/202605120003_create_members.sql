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
