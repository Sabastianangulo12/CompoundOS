create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.stripe_webhook_events enable row level security;

create unique index if not exists subscriptions_single_live_subscription_per_member_idx
on public.subscriptions (gym_id, member_id)
where status in ('active', 'trialing', 'past_due');

create unique index if not exists payments_stripe_payment_intent_id_key
on public.payments (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;
