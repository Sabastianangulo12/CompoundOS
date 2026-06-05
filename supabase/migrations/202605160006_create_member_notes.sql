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
