create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  notes text,
  performed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_name text not null,
  set_index integer not null check (set_index >= 1),
  reps integer not null check (reps >= 0),
  weight double precision not null default 0 check (weight >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workouts_gym_member_performed_idx
on public.workouts (gym_id, member_id, performed_at desc);

create index if not exists workouts_member_performed_idx
on public.workouts (member_id, performed_at desc);

create index if not exists workout_sets_workout_idx
on public.workout_sets (workout_id, set_index asc);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists "Users can view workouts for their gyms" on public.workouts;
create policy "Users can view workouts for their gyms"
on public.workouts
for select
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = workouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1 from public.members
    where members.id = workouts.member_id
      and members.gym_id = workouts.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Users can view workout_sets for their gyms" on public.workout_sets;
create policy "Users can view workout_sets for their gyms"
on public.workout_sets
for select
to authenticated
using (
  exists (
    select 1
    from public.workouts
    left join public.gym_users
      on gym_users.gym_id = workouts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
    left join public.members
      on members.id = workouts.member_id
      and members.gym_id = workouts.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
    where workouts.id = workout_sets.workout_id
      and (gym_users.id is not null or members.id is not null)
  )
);

create or replace function public.create_member_workout(
  workout_title text,
  workout_notes text,
  workout_performed_at timestamptz,
  workout_sets_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  new_workout_id uuid;
  payload_item jsonb;
  item_index integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(workout_title, '') is null then
    raise exception 'Workout title is required';
  end if;

  if jsonb_array_length(coalesce(workout_sets_payload, '[]'::jsonb)) = 0 then
    raise exception 'At least one workout set is required';
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

  insert into public.workouts (
    gym_id,
    member_id,
    title,
    notes,
    performed_at
  )
  values (
    current_member.gym_id,
    current_member.id,
    workout_title,
    nullif(workout_notes, ''),
    coalesce(workout_performed_at, timezone('utc', now()))
  )
  returning id into new_workout_id;

  for payload_item in
    select value from jsonb_array_elements(coalesce(workout_sets_payload, '[]'::jsonb))
  loop
    item_index := item_index + 1;

    insert into public.workout_sets (
      workout_id,
      exercise_name,
      set_index,
      reps,
      weight
    )
    values (
      new_workout_id,
      coalesce(nullif(payload_item ->> 'exercise_name', ''), 'Exercise'),
      coalesce((payload_item ->> 'set_index')::integer, item_index),
      greatest(coalesce((payload_item ->> 'reps')::integer, 0), 0),
      greatest(coalesce((payload_item ->> 'weight')::numeric, 0), 0)
    );
  end loop;

  return new_workout_id;
end;
$$;

grant execute on function public.create_member_workout(text, text, timestamptz, jsonb) to authenticated;
