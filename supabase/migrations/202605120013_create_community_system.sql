create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  sender_member_id uuid not null references public.members (id) on delete cascade,
  receiver_member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, sender_member_id, receiver_member_id),
  check (sender_member_id <> receiver_member_id)
);

create table if not exists public.member_blocks (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  blocker_member_id uuid not null references public.members (id) on delete cascade,
  blocked_member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, blocker_member_id, blocked_member_id),
  check (blocker_member_id <> blocked_member_id)
);

create table if not exists public.member_reports (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  reporter_member_id uuid not null references public.members (id) on delete cascade,
  reported_member_id uuid not null references public.members (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  check (reporter_member_id <> reported_member_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    nullif(coalesce(body, ''), '') is not null
    or nullif(coalesce(image_url, ''), '') is not null
  )
);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, member_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists friend_requests_receiver_idx
on public.friend_requests (receiver_member_id, status, created_at desc);

create index if not exists community_posts_gym_created_idx
on public.community_posts (gym_id, created_at desc);

create index if not exists post_comments_post_created_idx
on public.post_comments (post_id, created_at asc);

alter table public.friend_requests enable row level security;
alter table public.member_blocks enable row level security;
alter table public.member_reports enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.current_member_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1
$$;

create or replace function public.current_member_gym_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select gym_id
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1
$$;

create or replace function public.are_members_blocked(
  member_a uuid,
  member_b uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.member_blocks
    where (blocker_member_id = member_a and blocked_member_id = member_b)
       or (blocker_member_id = member_b and blocked_member_id = member_a)
  )
$$;

create or replace function public.are_members_friends(
  member_a uuid,
  member_b uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    member_a = member_b
    or (
      not public.are_members_blocked(member_a, member_b)
      and exists (
        select 1
        from public.friend_requests
        where status = 'accepted'
          and (
            (sender_member_id = member_a and receiver_member_id = member_b)
            or (sender_member_id = member_b and receiver_member_id = member_a)
          )
      )
    )
$$;

create or replace function public.search_gym_members(search_query text default '')
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    members.id,
    members.first_name,
    members.last_name,
    members.email
  from public.members
  where members.gym_id = public.current_member_gym_id()
    and members.id <> public.current_member_id()
    and members.status <> 'canceled'
    and not public.are_members_blocked(public.current_member_id(), members.id)
    and (
      coalesce(search_query, '') = ''
      or lower(
        concat_ws(' ', members.first_name, members.last_name, coalesce(members.email, ''))
      ) like '%' || lower(search_query) || '%'
    )
  order by members.first_name asc, members.last_name asc
  limit 12
$$;

create or replace function public.create_friend_request(target_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  if current_member.gym_id <> target_member.gym_id then
    raise exception 'Members must belong to the same gym';
  end if;

  if public.are_members_blocked(current_member.id, target_member.id) then
    raise exception 'Cannot send request to this member';
  end if;

  if public.are_members_friends(current_member.id, target_member.id) then
    raise exception 'Already connected';
  end if;

  insert into public.friend_requests (
    gym_id,
    sender_member_id,
    receiver_member_id,
    status
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id,
    'pending'
  )
  on conflict (gym_id, sender_member_id, receiver_member_id)
  do update set
    status = 'pending',
    updated_at = timezone('utc', now())
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.accept_friend_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
begin
  update public.friend_requests
  set status = 'accepted',
      updated_at = timezone('utc', now())
  where id = request_id
    and receiver_member_id = current_member_uuid
    and status = 'pending';

  return request_id;
end;
$$;

create or replace function public.create_community_post(
  post_body text,
  post_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  post_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  if current_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.community_posts (
    gym_id,
    member_id,
    body,
    image_url
  )
  values (
    current_member.gym_id,
    current_member.id,
    nullif(post_body, ''),
    nullif(post_image_url, '')
  )
  returning id into post_id;

  return post_id;
end;
$$;

create or replace function public.toggle_post_like(target_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_owner uuid;
begin
  select member_id into post_owner
  from public.community_posts
  where id = target_post_id;

  if post_owner is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_owner) then
    raise exception 'Not allowed to like this post';
  end if;

  if exists (
    select 1 from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid
  ) then
    delete from public.post_likes
    where post_id = target_post_id
      and member_id = current_member_uuid;

    return 'unliked';
  end if;

  insert into public.post_likes (post_id, member_id)
  values (target_post_id, current_member_uuid);

  return 'liked';
end;
$$;

create or replace function public.create_post_comment(
  target_post_id uuid,
  comment_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_uuid uuid := public.current_member_id();
  post_owner uuid;
  comment_id uuid;
begin
  select member_id into post_owner
  from public.community_posts
  where id = target_post_id;

  if post_owner is null then
    raise exception 'Post not found';
  end if;

  if not public.are_members_friends(current_member_uuid, post_owner) then
    raise exception 'Not allowed to comment on this post';
  end if;

  insert into public.post_comments (
    post_id,
    member_id,
    body
  )
  values (
    target_post_id,
    current_member_uuid,
    comment_body
  )
  returning id into comment_id;

  return comment_id;
end;
$$;

create or replace function public.block_member(target_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  block_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.member_blocks (
    gym_id,
    blocker_member_id,
    blocked_member_id
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id
  )
  on conflict (gym_id, blocker_member_id, blocked_member_id)
  do nothing
  returning id into block_id;

  return block_id;
end;
$$;

create or replace function public.report_member(
  target_member_id uuid,
  report_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  target_member public.members%rowtype;
  report_id uuid;
begin
  select * into current_member
  from public.members
  where id = public.current_member_id();

  select * into target_member
  from public.members
  where id = target_member_id;

  if current_member.id is null or target_member.id is null then
    raise exception 'Member not found';
  end if;

  insert into public.member_reports (
    gym_id,
    reporter_member_id,
    reported_member_id,
    reason
  )
  values (
    current_member.gym_id,
    current_member.id,
    target_member.id,
    report_reason
  )
  returning id into report_id;

  return report_id;
end;
$$;

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_gym_id() to authenticated;
grant execute on function public.are_members_blocked(uuid, uuid) to authenticated;
grant execute on function public.are_members_friends(uuid, uuid) to authenticated;
grant execute on function public.search_gym_members(text) to authenticated;
grant execute on function public.create_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.create_community_post(text, text) to authenticated;
grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.create_post_comment(uuid, text) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.report_member(uuid, text) to authenticated;

drop policy if exists "Members can view their own friend requests" on public.friend_requests;
create policy "Members can view their own friend requests"
on public.friend_requests
for select
to authenticated
using (
  sender_member_id = public.current_member_id()
  or receiver_member_id = public.current_member_id()
);

drop policy if exists "Members can view blocks involving them" on public.member_blocks;
create policy "Members can view blocks involving them"
on public.member_blocks
for select
to authenticated
using (
  blocker_member_id = public.current_member_id()
  or blocked_member_id = public.current_member_id()
);

drop policy if exists "Members can view their own reports" on public.member_reports;
create policy "Members can view their own reports"
on public.member_reports
for select
to authenticated
using (
  reporter_member_id = public.current_member_id()
);

drop policy if exists "Members can view friends-only posts" on public.community_posts;
create policy "Members can view friends-only posts"
on public.community_posts
for select
to authenticated
using (
  gym_id = public.current_member_gym_id()
  and public.are_members_friends(public.current_member_id(), member_id)
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
      and public.are_members_friends(public.current_member_id(), community_posts.member_id)
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
      and public.are_members_friends(public.current_member_id(), community_posts.member_id)
  )
);
