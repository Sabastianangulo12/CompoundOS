create or replace function public.get_member_billing_summary()
returns table (
  membership_status text,
  billing_cycle text,
  membership_plan_name text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  has_card_on_file boolean,
  card_brand text,
  card_last4 text,
  frozen_until date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  return query
  select
    current_member.status as membership_status,
    membership_plans.billing_interval::text as billing_cycle,
    membership_plans.name as membership_plan_name,
    subscriptions.current_period_start,
    subscriptions.current_period_end,
    (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
    null::text as card_brand,
    null::text as card_last4,
    current_member.frozen_until
  from public.subscriptions
  left join public.membership_plans
    on membership_plans.id = subscriptions.membership_plan_id
  where subscriptions.gym_id = current_member.gym_id
    and subscriptions.member_id = current_member.id
  order by subscriptions.created_at desc
  limit 1;

  if not found then
    return query
    select
      current_member.status as membership_status,
      null::text as billing_cycle,
      null::text as membership_plan_name,
      null::timestamptz as current_period_start,
      null::timestamptz as current_period_end,
      (current_member.stripe_default_payment_method_id is not null or current_member.stripe_customer_id is not null) as has_card_on_file,
      null::text as card_brand,
      null::text as card_last4,
      current_member.frozen_until;
  end if;
end;
$$;

grant execute on function public.get_member_billing_summary() to authenticated;
