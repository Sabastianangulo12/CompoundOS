create table if not exists public.member_scores (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  engagement_score integer not null check (engagement_score between 0 and 100),
  retention_risk_score integer not null check (retention_risk_score between 0 and 100),
  last_calculated_at timestamptz not null default timezone('utc', now()),
  primary key (gym_id, member_id)
);

create index if not exists member_scores_gym_risk_idx
on public.member_scores (gym_id, retention_risk_score desc);

alter table public.member_scores enable row level security;

drop policy if exists "Users can view member_scores for their gyms" on public.member_scores;
create policy "Users can view member_scores for their gyms"
on public.member_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can upsert member_scores for their gyms" on public.member_scores;
create policy "Users can upsert member_scores for their gyms"
on public.member_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1
    from public.members
    where members.id = member_scores.member_id
      and members.gym_id = member_scores.gym_id
  )
);

drop policy if exists "Users can update member_scores for their gyms" on public.member_scores;
create policy "Users can update member_scores for their gyms"
on public.member_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = member_scores.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and exists (
    select 1
    from public.members
    where members.id = member_scores.member_id
      and members.gym_id = member_scores.gym_id
  )
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  type text not null check (
    type in (
      'retention_risk',
      'inactivity',
      'attendance_drop',
      'failed_payment',
      'missing_subscription',
      'revenue_leak',
      'upsell_opportunity'
    )
  ),
  title text not null,
  description text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_insights_gym_priority_idx
on public.ai_insights (gym_id, priority, created_at desc);

create index if not exists ai_insights_member_idx
on public.ai_insights (member_id, created_at desc);

alter table public.ai_insights enable row level security;

drop policy if exists "Users can view ai_insights for their gyms" on public.ai_insights;
create policy "Users can view ai_insights for their gyms"
on public.ai_insights
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can create ai_insights for their gyms" on public.ai_insights;
create policy "Users can create ai_insights for their gyms"
on public.ai_insights
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    ai_insights.member_id is null
    or exists (
      select 1
      from public.members
      where members.id = ai_insights.member_id
        and members.gym_id = ai_insights.gym_id
    )
  )
);

drop policy if exists "Users can update ai_insights for their gyms" on public.ai_insights;
create policy "Users can update ai_insights for their gyms"
on public.ai_insights
for update
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  and (
    ai_insights.member_id is null
    or exists (
      select 1
      from public.members
      where members.id = ai_insights.member_id
        and members.gym_id = ai_insights.gym_id
    )
  )
);

drop policy if exists "Users can delete ai_insights for their gyms" on public.ai_insights;
create policy "Users can delete ai_insights for their gyms"
on public.ai_insights
for delete
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = ai_insights.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);
