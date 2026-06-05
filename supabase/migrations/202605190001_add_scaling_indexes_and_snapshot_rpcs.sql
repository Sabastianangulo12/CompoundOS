create index if not exists members_gym_created_at_idx
on public.members (gym_id, created_at desc);

create index if not exists members_gym_status_created_at_idx
on public.members (gym_id, status, created_at desc);

create index if not exists members_gym_name_idx
on public.members (gym_id, first_name, last_name);

create index if not exists subscriptions_gym_member_created_idx
on public.subscriptions (gym_id, member_id, created_at desc);

create index if not exists notifications_gym_member_created_idx
on public.notifications (gym_id, member_id, created_at desc);

create index if not exists ai_insights_gym_status_priority_created_idx
on public.ai_insights (gym_id, status, priority, created_at desc);

create index if not exists check_ins_gym_member_created_at_idx
on public.check_ins (gym_id, member_id, created_at desc);

create index if not exists fridge_access_events_gym_status_created_idx
on public.fridge_access_events (gym_id, status, created_at desc);

create or replace function public.get_latest_member_check_ins_for_gym(
  p_gym_id uuid
)
returns table (
  member_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (check_ins.member_id)
    check_ins.member_id,
    check_ins.created_at
  from public.check_ins
  where check_ins.gym_id = p_gym_id
  order by check_ins.member_id, check_ins.created_at desc
$$;

grant execute on function public.get_latest_member_check_ins_for_gym(uuid) to authenticated;

create or replace function public.get_latest_member_notifications_for_gym(
  p_gym_id uuid
)
returns table (
  member_id uuid,
  title text,
  type text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (notifications.member_id)
    notifications.member_id,
    notifications.title,
    notifications.type,
    notifications.created_at
  from public.notifications
  where notifications.gym_id = p_gym_id
  order by notifications.member_id, notifications.created_at desc
$$;

grant execute on function public.get_latest_member_notifications_for_gym(uuid) to authenticated;
