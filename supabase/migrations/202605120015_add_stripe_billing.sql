alter table public.gyms
add column if not exists stripe_connected_account_id text,
add column if not exists stripe_onboarding_completed boolean not null default false,
add column if not exists stripe_charges_enabled boolean not null default false,
add column if not exists stripe_payouts_enabled boolean not null default false,
add column if not exists stripe_details_submitted boolean not null default false;

alter table public.members
add column if not exists stripe_customer_id text;

create unique index if not exists gyms_stripe_connected_account_id_key
on public.gyms (stripe_connected_account_id)
where stripe_connected_account_id is not null;

create unique index if not exists members_stripe_customer_id_key
on public.members (stripe_customer_id)
where stripe_customer_id is not null;

create unique index if not exists membership_plans_stripe_price_id_key
on public.membership_plans (stripe_price_id)
where stripe_price_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_key
on public.subscriptions (stripe_subscription_id)
where stripe_subscription_id is not null;

create unique index if not exists payments_stripe_invoice_id_key
on public.payments (stripe_invoice_id)
where stripe_invoice_id is not null;

create index if not exists payments_stripe_payment_intent_id_idx
on public.payments (stripe_payment_intent_id)
where stripe_payment_intent_id is not null;
