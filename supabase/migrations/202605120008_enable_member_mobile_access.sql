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
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Members can view their own member record" on public.members;
create policy "Members can view their own member record"
on public.members
for select
to authenticated
using (
  status <> 'canceled'
  and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
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
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
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
      and members.status <> 'canceled'
      and lower(coalesce(members.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
