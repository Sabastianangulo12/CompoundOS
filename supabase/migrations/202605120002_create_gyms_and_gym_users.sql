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
