alter table public.notifications
add column if not exists read_at timestamptz;

create index if not exists notifications_member_unread_idx
on public.notifications (member_id, created_at desc)
where read_at is null;

create or replace function public.mark_member_notification_read(
  target_notification_id uuid
)
returns uuid
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
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, timezone('utc', now()))
  where id = target_notification_id
    and member_id = current_member.id;

  if not found then
    raise exception 'Notification not found for this member';
  end if;

  return target_notification_id;
end;
$$;

create or replace function public.mark_all_member_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into current_member
  from public.members
  where user_id = auth.uid()
    and status <> 'canceled'
  order by updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user';
  end if;

  update public.notifications
  set read_at = timezone('utc', now())
  where member_id = current_member.id
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_member_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_member_notifications_read() to authenticated;
