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
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists member_push_tokens_member_idx
on public.member_push_tokens (member_id, updated_at desc);

create index if not exists notifications_member_created_idx
on public.notifications (member_id, created_at desc);

create index if not exists notifications_gym_status_created_idx
on public.notifications (gym_id, status, created_at desc);

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
