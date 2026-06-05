drop function if exists public.get_member_app_bootstrap(integer, integer, integer);

create function public.get_member_app_bootstrap(
  notifications_limit integer default 12,
  announcements_limit integer default 6,
  recent_checkins_limit integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  member_row public.members%rowtype;
  gym_row public.gyms%rowtype;
  total_visits integer := 0;
  recent_checkins jsonb := '[]'::jsonb;
  recent_notifications jsonb := '[]'::jsonb;
  recent_announcements jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    return null;
  end if;

  select *
  into member_row
  from public.members
  where user_id = current_user_id
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if member_row.id is null then
    return null;
  end if;

  select *
  into gym_row
  from public.gyms
  where id = member_row.gym_id
  limit 1;

  select count(*)
  into total_visits
  from public.check_ins
  where gym_id = member_row.gym_id
    and member_id = member_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'check_in_method', c.check_in_method
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_checkins
  from (
    select id, created_at, check_in_method
    from public.check_ins
    where gym_id = member_row.gym_id
      and member_id = member_row.id
    order by created_at desc
    limit greatest(recent_checkins_limit, 1)
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'body', n.body,
        'type', n.type,
        'status', n.status,
        'created_at', n.created_at,
        'read_at', n.read_at
      )
      order by n.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_notifications
  from (
    select id, title, body, type, status, created_at, read_at
    from public.notifications
    where member_id = member_row.id
    order by created_at desc
    limit greatest(notifications_limit, 1)
  ) n;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'gym_id', a.gym_id,
        'title', a.title,
        'body', a.body,
        'is_pinned', a.is_pinned,
        'is_active', a.is_active,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
      order by a.is_pinned desc, a.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_announcements
  from (
    select id, gym_id, title, body, is_pinned, is_active, created_at, updated_at
    from public.gym_announcements
    where gym_id = member_row.gym_id
      and is_active = true
    order by is_pinned desc, created_at desc
    limit greatest(announcements_limit, 1)
  ) a;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'id', member_row.id,
      'gym_id', member_row.gym_id,
      'user_id', member_row.user_id,
      'first_name', member_row.first_name,
      'last_name', member_row.last_name,
      'email', member_row.email,
      'phone', member_row.phone,
      'status', member_row.status,
      'frozen_until', member_row.frozen_until,
      'canceled_at', member_row.canceled_at,
      'joined_at', member_row.joined_at
    ),
    'gym', case
      when gym_row.id is null then null
      else jsonb_build_object(
        'id', gym_row.id,
        'name', gym_row.name,
        'slug', gym_row.slug,
        'timezone', gym_row.timezone
      )
    end,
    'stats', jsonb_build_object(
      'totalVisits', total_visits,
      'lastCheckInAt', coalesce(recent_checkins -> 0 ->> 'created_at', null)
    ),
    'recentCheckIns', recent_checkins,
    'notifications', recent_notifications,
    'announcements', recent_announcements
  );
end;
$$;

grant execute on function public.get_member_app_bootstrap(integer, integer, integer) to authenticated;
