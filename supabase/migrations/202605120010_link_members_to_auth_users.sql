alter table public.members
add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists members_user_id_unique_idx
on public.members (user_id)
where user_id is not null;

create index if not exists members_gym_user_idx
on public.members (gym_id, user_id);

create or replace function public.claim_member_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_member_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.members
  set user_id = auth.uid(),
      updated_at = timezone('utc', now())
  where user_id is null
    and status <> 'canceled'
    and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning id into claimed_member_id;

  if claimed_member_id is not null then
    return claimed_member_id;
  end if;

  select id
  into claimed_member_id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  return claimed_member_id;
end;
$$;

grant execute on function public.claim_member_profile() to authenticated;

drop policy if exists "Members can view their own gym" on public.gyms;
create policy "Members can view their own gym"
on public.gyms
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.gym_id = gyms.id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Members can view their own member record" on public.members;
create policy "Members can view their own member record"
on public.members
for select
to authenticated
using (
  status <> 'canceled'
  and user_id = auth.uid()
);

drop policy if exists "Members can view their own check_ins" on public.check_ins;
create policy "Members can view their own check_ins"
on public.check_ins
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Members can create their own check_ins" on public.check_ins;
create policy "Members can create their own check_ins"
on public.check_ins
for insert
to authenticated
with check (
  exists (
    select 1
    from public.members
    where members.id = check_ins.member_id
      and members.gym_id = check_ins.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);
