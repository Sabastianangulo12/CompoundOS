drop policy if exists "Members can view active membership plans in their gym" on public.membership_plans;
create policy "Members can view active membership plans in their gym"
on public.membership_plans
for select
to authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.members
    where members.gym_id = membership_plans.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);
