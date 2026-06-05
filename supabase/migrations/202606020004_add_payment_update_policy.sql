drop policy if exists "Users can update payments for their gyms" on public.payments;
create policy "Users can update payments for their gyms"
on public.payments
for update
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = payments.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = payments.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    payments.member_id is null
    or exists (
      select 1 from public.members
      where members.id = payments.member_id
        and members.gym_id = payments.gym_id
    )
  )
  and (
    payments.subscription_id is null
    or exists (
      select 1 from public.subscriptions
      where subscriptions.id = payments.subscription_id
        and subscriptions.gym_id = payments.gym_id
    )
  )
);
