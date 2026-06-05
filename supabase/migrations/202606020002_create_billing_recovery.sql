alter table public.payments
add column if not exists due_at timestamptz,
add column if not exists invoice_number text,
add column if not exists description text,
add column if not exists payment_type text not null default 'membership',
add column if not exists accounting_category text not null default 'membership',
add column if not exists refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
add column if not exists refunded_at timestamptz,
add column if not exists refund_reason text,
add column if not exists stripe_refund_id text;

alter table public.payments
drop constraint if exists payments_status_check;

alter table public.payments
add constraint payments_status_check
check (status in ('succeeded', 'failed', 'pending', 'scheduled', 'overdue', 'refunded'));

alter table public.payments
drop constraint if exists payments_payment_type_check;

alter table public.payments
add constraint payments_payment_type_check
check (payment_type in ('membership', 'drop_in', 'pos', 'class_fee', 'manual', 'refund_adjustment'));

create index if not exists payments_gym_id_due_at_idx
on public.payments (gym_id, due_at)
where due_at is not null;

create index if not exists payments_gym_id_accounting_idx
on public.payments (gym_id, accounting_category, created_at desc);

create unique index if not exists payments_stripe_refund_id_key
on public.payments (stripe_refund_id)
where stripe_refund_id is not null;

create table if not exists public.billing_retry_policies (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade unique,
  retry_offsets_days integer[] not null default array[2, 4, 7],
  reminder_offsets_days integer[] not null default array[0, 2, 4, 7],
  max_attempts integer not null default 3 check (max_attempts > 0 and max_attempts <= 10),
  final_notice_after_days integer not null default 10 check (final_notice_after_days >= 1),
  auto_retry_enabled boolean not null default true,
  member_notifications_enabled boolean not null default true,
  daily_report_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_recovery_cases (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid references public.members (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  reason text not null check (reason in ('failed_payment', 'past_due_subscription', 'missing_card', 'overdue_payment')),
  status text not null default 'open' check (status in ('open', 'retrying', 'waiting_on_member', 'resolved', 'closed')),
  priority text not null default 'high' check (priority in ('low', 'medium', 'high', 'critical')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries >= 0),
  first_failed_at timestamptz,
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  last_reminder_at timestamptz,
  final_notice_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  case_id uuid not null references public.billing_recovery_cases (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  member_id uuid references public.members (id) on delete cascade,
  attempt_number integer not null default 1 check (attempt_number > 0),
  action text not null check (action in ('retry_charge', 'send_reminder', 'final_notice', 'manual_note', 'mark_resolved', 'refund')),
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'succeeded', 'failed', 'skipped')),
  scheduled_at timestamptz,
  processed_at timestamptz,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  result_message text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  idempotency_key text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_daily_reports (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  report_date date not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, report_date)
);

create unique index if not exists billing_recovery_open_payment_case_idx
on public.billing_recovery_cases (payment_id)
where payment_id is not null and status in ('open', 'retrying', 'waiting_on_member');

create index if not exists billing_recovery_cases_gym_status_idx
on public.billing_recovery_cases (gym_id, status, priority, next_retry_at);

create index if not exists billing_recovery_cases_member_idx
on public.billing_recovery_cases (member_id, status, created_at desc);

create index if not exists billing_recovery_attempts_case_idx
on public.billing_recovery_attempts (case_id, created_at desc);

create unique index if not exists billing_recovery_attempts_idempotency_key_idx
on public.billing_recovery_attempts (idempotency_key)
where idempotency_key is not null;

alter table public.billing_retry_policies enable row level security;
alter table public.billing_recovery_cases enable row level security;
alter table public.billing_recovery_attempts enable row level security;
alter table public.billing_daily_reports enable row level security;

drop trigger if exists billing_retry_policies_set_updated_at on public.billing_retry_policies;
create trigger billing_retry_policies_set_updated_at
before update on public.billing_retry_policies
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists billing_recovery_cases_set_updated_at on public.billing_recovery_cases;
create trigger billing_recovery_cases_set_updated_at
before update on public.billing_recovery_cases
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can manage billing_retry_policies for their gyms" on public.billing_retry_policies;
create policy "Users can manage billing_retry_policies for their gyms"
on public.billing_retry_policies
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_retry_policies.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_retry_policies.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can manage billing_recovery_cases for their gyms" on public.billing_recovery_cases;
create policy "Users can manage billing_recovery_cases for their gyms"
on public.billing_recovery_cases
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_recovery_cases.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_recovery_cases.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can manage billing_recovery_attempts for their gyms" on public.billing_recovery_attempts;
create policy "Users can manage billing_recovery_attempts for their gyms"
on public.billing_recovery_attempts
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_recovery_attempts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_recovery_attempts.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Users can manage billing_daily_reports for their gyms" on public.billing_daily_reports;
create policy "Users can manage billing_daily_reports for their gyms"
on public.billing_daily_reports
for all
to authenticated
using (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_daily_reports.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1 from public.gym_users
    where gym_users.gym_id = billing_daily_reports.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);
