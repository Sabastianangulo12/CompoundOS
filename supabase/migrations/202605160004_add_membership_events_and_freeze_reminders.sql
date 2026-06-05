create table if not exists public.member_membership_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  event_type text not null check (event_type in ('frozen', 'canceled')),
  reason text,
  frozen_until date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.member_freeze_reminders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('one_week', 'two_days')),
  frozen_until date not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (member_id, reminder_type, frozen_until)
);

create index if not exists member_membership_events_gym_type_created_idx
on public.member_membership_events (gym_id, event_type, created_at desc);

create index if not exists member_membership_events_member_created_idx
on public.member_membership_events (member_id, created_at desc);

create index if not exists member_freeze_reminders_member_type_until_idx
on public.member_freeze_reminders (member_id, reminder_type, frozen_until);

alter table public.member_membership_events enable row level security;
alter table public.member_freeze_reminders enable row level security;

drop policy if exists "Users can view membership events for their gyms" on public.member_membership_events;
create policy "Users can view membership events for their gyms"
on public.member_membership_events
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_membership_events.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can view freeze reminders for their gyms" on public.member_freeze_reminders;
create policy "Users can view freeze reminders for their gyms"
on public.member_freeze_reminders
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_freeze_reminders.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);
