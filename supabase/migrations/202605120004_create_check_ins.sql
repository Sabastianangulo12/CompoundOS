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
