create table if not exists public.schedule_programs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#f5c542',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  program_id uuid references public.schedule_programs (id) on delete set null,
  title text not null,
  description text,
  instructor_name text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Los_Angeles',
  capacity integer check (capacity is null or capacity > 0),
  booking_enabled boolean not null default false,
  waitlist_enabled boolean not null default false,
  visibility text not null default 'member_portal' check (visibility in ('member_portal', 'website', 'public', 'staff_only')),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  status text not null default 'active' check (status in ('active', 'canceled')),
  cancellation_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint schedule_sessions_time_check check (ends_at > starts_at)
);

create table if not exists public.schedule_bookings (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  session_id uuid not null references public.schedule_sessions (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  guest_name text,
  guest_email text,
  guest_phone text,
  status text not null default 'booked' check (status in ('booked', 'waitlisted', 'canceled', 'checked_in', 'no_show')),
  source text not null default 'dashboard' check (source in ('dashboard', 'member_app', 'website', 'public_widget')),
  notes text,
  booked_at timestamptz not null default timezone('utc', now()),
  canceled_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint schedule_bookings_person_check check (member_id is not null or guest_name is not null)
);

alter table public.check_ins
add column if not exists schedule_session_id uuid references public.schedule_sessions (id) on delete set null;

create index if not exists schedule_programs_gym_id_active_idx
on public.schedule_programs (gym_id, is_active, sort_order, name);

create index if not exists schedule_sessions_gym_id_starts_at_idx
on public.schedule_sessions (gym_id, starts_at);

create index if not exists schedule_sessions_gym_id_status_booking_idx
on public.schedule_sessions (gym_id, status, booking_enabled, starts_at);

create index if not exists schedule_bookings_session_status_idx
on public.schedule_bookings (session_id, status, booked_at);

create index if not exists schedule_bookings_member_status_idx
on public.schedule_bookings (member_id, status, booked_at desc);

create unique index if not exists schedule_bookings_unique_active_member_idx
on public.schedule_bookings (session_id, member_id)
where member_id is not null and status in ('booked', 'waitlisted', 'checked_in');

create index if not exists check_ins_schedule_session_id_idx
on public.check_ins (schedule_session_id, created_at desc);

alter table public.schedule_programs enable row level security;
alter table public.schedule_sessions enable row level security;
alter table public.schedule_bookings enable row level security;

drop trigger if exists schedule_programs_set_updated_at on public.schedule_programs;
create trigger schedule_programs_set_updated_at
before update on public.schedule_programs
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists schedule_sessions_set_updated_at on public.schedule_sessions;
create trigger schedule_sessions_set_updated_at
before update on public.schedule_sessions
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists schedule_bookings_set_updated_at on public.schedule_bookings;
create trigger schedule_bookings_set_updated_at
before update on public.schedule_bookings
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view schedule_programs for their gyms" on public.schedule_programs;
create policy "Users can view schedule_programs for their gyms"
on public.schedule_programs
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_programs.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can manage schedule_programs for their gyms" on public.schedule_programs;
create policy "Users can manage schedule_programs for their gyms"
on public.schedule_programs
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_programs.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_programs.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can view schedule_sessions for their gyms" on public.schedule_sessions;
create policy "Users can view schedule_sessions for their gyms"
on public.schedule_sessions
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_sessions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.gym_id = schedule_sessions.gym_id
      and members.user_id = auth.uid()
      and members.status in ('active', 'lead')
      and schedule_sessions.status = 'active'
      and schedule_sessions.visibility in ('member_portal', 'public')
  )
);

drop policy if exists "Users can manage schedule_sessions for their gyms" on public.schedule_sessions;
create policy "Users can manage schedule_sessions for their gyms"
on public.schedule_sessions
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_sessions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_sessions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    schedule_sessions.program_id is null
    or exists (
      select 1 from public.schedule_programs
      where schedule_programs.id = schedule_sessions.program_id
        and schedule_programs.gym_id = schedule_sessions.gym_id
    )
  )
);

drop policy if exists "Users can view schedule_bookings for their gyms" on public.schedule_bookings;
create policy "Users can view schedule_bookings for their gyms"
on public.schedule_bookings
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_bookings.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.id = schedule_bookings.member_id
      and members.user_id = auth.uid()
      and members.gym_id = schedule_bookings.gym_id
  )
);

drop policy if exists "Users can manage schedule_bookings for their gyms" on public.schedule_bookings;
create policy "Users can manage schedule_bookings for their gyms"
on public.schedule_bookings
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_bookings.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = schedule_bookings.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1 from public.schedule_sessions
    where schedule_sessions.id = schedule_bookings.session_id
      and schedule_sessions.gym_id = schedule_bookings.gym_id
  )
  and (
    schedule_bookings.member_id is null
    or exists (
      select 1 from public.members
      where members.id = schedule_bookings.member_id
        and members.gym_id = schedule_bookings.gym_id
    )
  )
);

create or replace function public.create_schedule_booking_for_member(
  target_session_id uuid,
  target_member_id uuid,
  booking_source text default 'member_app'
)
returns public.schedule_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session public.schedule_sessions%rowtype;
  target_member public.members%rowtype;
  existing_booking public.schedule_bookings%rowtype;
  booked_count integer;
  next_status text;
  created_booking public.schedule_bookings%rowtype;
begin
  select *
  into target_session
  from public.schedule_sessions
  where id = target_session_id
  for update;

  if target_session.id is null then
    raise exception 'Session not found.';
  end if;

  if target_session.status <> 'active' then
    raise exception 'This session is not active.';
  end if;

  if target_session.booking_enabled = false then
    raise exception 'Booking is not enabled for this session.';
  end if;

  if target_session.starts_at <= timezone('utc', now()) then
    raise exception 'This session has already started.';
  end if;

  select *
  into target_member
  from public.members
  where id = target_member_id
    and gym_id = target_session.gym_id;

  if target_member.id is null then
    raise exception 'Member not found for this gym.';
  end if;

  if target_member.status not in ('active', 'lead') then
    raise exception 'Only active members or leads can book sessions.';
  end if;

  select *
  into existing_booking
  from public.schedule_bookings
  where session_id = target_session_id
    and member_id = target_member_id
    and status in ('booked', 'waitlisted', 'checked_in')
  limit 1;

  if existing_booking.id is not null then
    return existing_booking;
  end if;

  select count(*)
  into booked_count
  from public.schedule_bookings
  where session_id = target_session_id
    and status in ('booked', 'checked_in');

  if target_session.capacity is null or booked_count < target_session.capacity then
    next_status := 'booked';
  elsif target_session.waitlist_enabled then
    next_status := 'waitlisted';
  else
    raise exception 'This session is full.';
  end if;

  insert into public.schedule_bookings (
    gym_id,
    session_id,
    member_id,
    status,
    source
  )
  values (
    target_session.gym_id,
    target_session.id,
    target_member.id,
    next_status,
    case
      when booking_source in ('dashboard', 'member_app', 'website', 'public_widget') then booking_source
      else 'member_app'
    end
  )
  returning * into created_booking;

  return created_booking;
end;
$$;

create or replace function public.cancel_schedule_booking_for_member(
  target_booking_id uuid,
  target_member_id uuid
)
returns public.schedule_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  target_booking public.schedule_bookings%rowtype;
  promoted_booking public.schedule_bookings%rowtype;
  was_booked boolean;
begin
  select *
  into target_booking
  from public.schedule_bookings
  where id = target_booking_id
    and member_id = target_member_id
    and status in ('booked', 'waitlisted')
  for update;

  if target_booking.id is null then
    raise exception 'Booking not found or cannot be canceled.';
  end if;

  was_booked := target_booking.status = 'booked';

  update public.schedule_bookings
  set status = 'canceled',
      canceled_at = timezone('utc', now())
  where id = target_booking.id
  returning * into target_booking;

  if was_booked then
    select schedule_bookings.*
    into promoted_booking
    from public.schedule_bookings
    join public.schedule_sessions on schedule_sessions.id = schedule_bookings.session_id
    where schedule_bookings.session_id = target_booking.session_id
      and schedule_bookings.status = 'waitlisted'
      and schedule_sessions.waitlist_enabled = true
    order by schedule_bookings.booked_at asc
    limit 1
    for update of schedule_bookings;

    if promoted_booking.id is not null then
      update public.schedule_bookings
      set status = 'booked'
      where id = promoted_booking.id;
    end if;
  end if;

  return target_booking;
end;
$$;

grant execute on function public.create_schedule_booking_for_member(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.cancel_schedule_booking_for_member(uuid, uuid) to authenticated, service_role;
