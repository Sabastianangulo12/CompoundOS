create or replace function public.fetch_friend_step_leaderboard(
  leaderboard_limit integer default 5
)
returns table (
  member_id uuid,
  first_name text,
  last_name text,
  step_count integer,
  rank integer
)
language sql
security definer
stable
set search_path = public
as $$
  with current_member as (
    select
      public.current_member_id() as member_id,
      public.current_member_gym_id() as gym_id
  ),
  friend_members as (
    select distinct
      case
        when friend_requests.sender_member_id = current_member.member_id
          then friend_requests.receiver_member_id
        else friend_requests.sender_member_id
      end as member_id
    from public.friend_requests
    cross join current_member
    where friend_requests.status = 'accepted'
      and friend_requests.gym_id = current_member.gym_id
      and (
        friend_requests.sender_member_id = current_member.member_id
        or friend_requests.receiver_member_id = current_member.member_id
      )
  ),
  today_check_ins as (
    select
      check_ins.member_id,
      count(*)::integer as check_ins_today
    from public.check_ins
    where check_ins.created_at at time zone 'utc' >= date_trunc('day', timezone('utc', now()))
      and check_ins.created_at at time zone 'utc' < date_trunc('day', timezone('utc', now())) + interval '1 day'
    group by check_ins.member_id
  ),
  today_workouts as (
    select
      workouts.member_id,
      count(*)::integer as workouts_today
    from public.workouts
    where workouts.performed_at at time zone 'utc' >= date_trunc('day', timezone('utc', now()))
      and workouts.performed_at at time zone 'utc' < date_trunc('day', timezone('utc', now())) + interval '1 day'
    group by workouts.member_id
  ),
  scored as (
    select
      members.id as member_id,
      members.first_name,
      members.last_name,
      greatest(
        coalesce(today_check_ins.check_ins_today, 0) * 1700
        + coalesce(today_workouts.workouts_today, 0) * 2600,
        0
      )::integer as step_count
    from friend_members
    join current_member on true
    join public.members
      on members.id = friend_members.member_id
    left join today_check_ins
      on today_check_ins.member_id = members.id
    left join today_workouts
      on today_workouts.member_id = members.id
    where members.gym_id = current_member.gym_id
      and members.status <> 'canceled'
  )
  select
    scored.member_id,
    scored.first_name,
    scored.last_name,
    scored.step_count,
    row_number() over (
      order by scored.step_count desc, scored.first_name asc, scored.last_name asc
    )::integer as rank
  from scored
  order by scored.step_count desc, scored.first_name asc, scored.last_name asc
  limit greatest(coalesce(leaderboard_limit, 5), 1);
$$;

grant execute on function public.fetch_friend_step_leaderboard(integer) to authenticated;
