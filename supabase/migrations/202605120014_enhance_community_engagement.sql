alter table public.community_posts
add column if not exists visibility text not null default 'friends_only'
check (visibility in ('friends_only', 'gym_feed'));

alter table public.community_posts
add column if not exists is_auto_generated boolean not null default false;

alter table public.community_posts
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.post_likes
add column if not exists reaction text not null default '🔥'
check (reaction in ('🔥', '💪', '👏'));

create index if not exists community_posts_gym_visibility_created_idx
on public.community_posts (gym_id, visibility, created_at desc);

create index if not exists post_likes_post_reaction_idx
on public.post_likes (post_id, reaction);

create or replace function public.member_current_check_in_streak(target_member_id uuid)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  unique_days date[];
  today_date date := current_date;
  comparison_date date;
  streak integer := 0;
  day_index integer := 1;
begin
  select coalesce(array_agg(distinct (created_at at time zone 'utc')::date order by (created_at at time zone 'utc')::date desc), '{}'::date[])
  into unique_days
  from public.check_ins
  where member_id = target_member_id;

  if coalesce(array_length(unique_days, 1), 0) = 0 then
    return 0;
  end if;

  if unique_days[1] = today_date then
    streak := 1;
    day_index := 2;
  elsif unique_days[1] = today_date - 1 then
    streak := 1;
    day_index := 2;
  else
    return 0;
  end if;

  while day_index <= coalesce(array_length(unique_days, 1), 0) loop
    comparison_date := unique_days[day_index - 1] - 1;

    if unique_days[day_index] <> comparison_date then
      exit;
    end if;

    streak := streak + 1;
    day_index := day_index + 1;
  end loop;

  return streak;
end;
$$;

create or replace function public.create_community_post(
  post_body text,
  post_image_url text,
  post_visibility text default 'friends_only'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  normalized_visibility text := coalesce(nullif(post_visibility, ''), 'friends_only');
  post_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  if current_member.id is null then
    raise exception 'Member not found';
  end if;

  if normalized_visibility not in ('friends_only', 'gym_feed') then
    raise exception 'Invalid post visibility';
  end if;

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    image_url,
    visibility
  )
  values (
    current_member.gym_id,
    current_member.id,
    nullif(post_body, ''),
    nullif(post_image_url, ''),
    normalized_visibility
  )
  returning id into post_id;

  return post_id;
end;
$$;

create or replace function public.react_to_post(
  target_post_id uuid,
  reaction_value text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_record public.community_posts%rowtype;
  normalized_reaction text := coalesce(nullif(reaction_value, ''), '🔥');
begin
  if normalized_reaction not in ('🔥', '💪', '👏') then
    raise exception 'Invalid reaction';
  end if;

  select *
  into post_record
  from public.community_posts
  where id = target_post_id;

  if post_record.id is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_record.member_id) then
    raise exception 'Not allowed to react to this post';
  end if;

  if exists (
    select 1
    from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid
      and reaction = normalized_reaction
  ) then
    delete from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid;

    return 'removed';
  end if;

  insert into public.post_likes (post_id, member_id, reaction)
  values (target_post_id, current_member_uuid, normalized_reaction)
  on conflict (post_id, member_id)
  do update set
    reaction = excluded.reaction,
    created_at = timezone('utc', now());

  return 'reacted';
end;
$$;

create or replace function public.create_check_in_milestone_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_record public.members%rowtype;
  total_check_ins integer;
  current_streak integer;
  milestone integer;
  milestone_message text;
begin
  select *
  into member_record
  from public.members
  where id = new.member_id;

  if member_record.id is null then
    return new;
  end if;

  select count(*)
  into total_check_ins
  from public.check_ins
  where member_id = new.member_id;

  if total_check_ins not in (5, 10, 30) then
    return new;
  end if;

  milestone := total_check_ins;

  if exists (
    select 1
    from public.community_posts
    where member_id = new.member_id
      and is_auto_generated = true
      and metadata ->> 'type' = 'check_in_milestone'
      and metadata ->> 'milestone' = milestone::text
  ) then
    return new;
  end if;

  current_streak := public.member_current_check_in_streak(new.member_id);
  milestone_message := trim(
    format(
      '%s just hit %s check-ins%s 🔥',
      member_record.first_name,
      milestone,
      case
        when current_streak > 0 then format(' and is on a %s-day streak', current_streak)
        else ''
      end
    )
  );

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    visibility,
    is_auto_generated,
    metadata
  )
  values (
    member_record.gym_id,
    new.member_id,
    milestone_message,
    'friends_only',
    true,
    jsonb_build_object(
      'type', 'check_in_milestone',
      'milestone', milestone,
      'streak', current_streak
    )
  );

  return new;
end;
$$;

drop trigger if exists create_check_in_milestone_post on public.check_ins;
create trigger create_check_in_milestone_post
after insert on public.check_ins
for each row
execute function public.create_check_in_milestone_post();

grant execute on function public.member_current_check_in_streak(uuid) to authenticated;
grant execute on function public.create_community_post(text, text, text) to authenticated;
grant execute on function public.react_to_post(uuid, text) to authenticated;

revoke execute on function public.create_community_post(text, text) from authenticated;
revoke execute on function public.toggle_post_like(uuid) from authenticated;

drop function if exists public.create_community_post(text, text);
drop function if exists public.toggle_post_like(uuid);

drop policy if exists "Members can view friends-only posts" on public.community_posts;
create policy "Members can view community posts in scope"
on public.community_posts
for select
to authenticated
using (
  gym_id = public.current_member_gym_id()
  and not public.are_members_blocked(public.current_member_id(), member_id)
  and (
    visibility = 'gym_feed'
    or public.are_members_friends(public.current_member_id(), member_id)
  )
);

drop policy if exists "Members can view likes on visible posts" on public.post_likes;
create policy "Members can view likes on visible posts"
on public.post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_likes.post_id
      and community_posts.gym_id = public.current_member_gym_id()
      and not public.are_members_blocked(public.current_member_id(), community_posts.member_id)
      and (
        community_posts.visibility = 'gym_feed'
        or public.are_members_friends(public.current_member_id(), community_posts.member_id)
      )
  )
);

drop policy if exists "Members can view comments on visible posts" on public.post_comments;
create policy "Members can view comments on visible posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.community_posts
    where community_posts.id = post_comments.post_id
      and community_posts.gym_id = public.current_member_gym_id()
      and not public.are_members_blocked(public.current_member_id(), community_posts.member_id)
      and (
        community_posts.visibility = 'gym_feed'
        or public.are_members_friends(public.current_member_id(), community_posts.member_id)
      )
  )
);
