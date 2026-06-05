create table if not exists public.fridge_products (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_unlock_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  selected_items jsonb not null default '[]'::jsonb,
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'unlocked', 'confirmed', 'expired', 'canceled')),
  qr_token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_access_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  fridge_unlock_session_id uuid not null references public.fridge_unlock_sessions (id) on delete cascade,
  fridge_label text not null default 'Smart Fridge',
  selected_items jsonb not null default '[]'::jsonb,
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  status text not null check (status in ('pending', 'unlocked', 'confirmed', 'expired', 'canceled')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_orders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  fridge_unlock_session_id uuid not null unique references public.fridge_unlock_sessions (id) on delete cascade,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  stripe_payment_intent_id text,
  receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fridge_order_items (
  id uuid primary key default gen_random_uuid(),
  fridge_order_id uuid not null references public.fridge_orders (id) on delete cascade,
  product_id uuid references public.fridge_products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_price_cents integer not null check (total_price_cents >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.members
add column if not exists stripe_default_payment_method_id text;

create index if not exists fridge_products_gym_active_sort_idx
on public.fridge_products (gym_id, is_active, sort_order asc, created_at desc);

create index if not exists fridge_unlock_sessions_member_created_idx
on public.fridge_unlock_sessions (member_id, created_at desc);

create index if not exists fridge_unlock_sessions_gym_status_expires_idx
on public.fridge_unlock_sessions (gym_id, status, expires_at asc);

create index if not exists fridge_access_events_gym_created_idx
on public.fridge_access_events (gym_id, created_at desc);

create index if not exists fridge_access_events_member_created_idx
on public.fridge_access_events (member_id, created_at desc);

create index if not exists fridge_orders_member_created_idx
on public.fridge_orders (member_id, created_at desc);

create index if not exists fridge_orders_gym_status_created_idx
on public.fridge_orders (gym_id, status, created_at desc);

create index if not exists fridge_order_items_order_idx
on public.fridge_order_items (fridge_order_id, created_at asc);

alter table public.fridge_products enable row level security;
alter table public.fridge_unlock_sessions enable row level security;
alter table public.fridge_access_events enable row level security;
alter table public.fridge_orders enable row level security;
alter table public.fridge_order_items enable row level security;

drop trigger if exists fridge_products_set_updated_at on public.fridge_products;
create trigger fridge_products_set_updated_at
before update on public.fridge_products
for each row
execute function public.set_current_timestamp_updated_at();

drop policy if exists "Users can view fridge products for their gyms" on public.fridge_products;
create policy "Users can view fridge products for their gyms"
on public.fridge_products
for select
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
  or exists (
    select 1
    from public.members
    where members.gym_id = fridge_products.gym_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
);

drop policy if exists "Staff can manage fridge products for their gyms" on public.fridge_products;
create policy "Staff can manage fridge products for their gyms"
on public.fridge_products
for all
to authenticated
using (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_products.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge sessions" on public.fridge_unlock_sessions;
create policy "Members can view their own fridge sessions"
on public.fridge_unlock_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_unlock_sessions.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_unlock_sessions.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge access events" on public.fridge_access_events;
create policy "Members can view their own fridge access events"
on public.fridge_access_events
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_access_events.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_access_events.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge orders" on public.fridge_orders;
create policy "Members can view their own fridge orders"
on public.fridge_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.members
    where members.id = fridge_orders.member_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.gym_users
    where gym_users.gym_id = fridge_orders.gym_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);

drop policy if exists "Members can view their own fridge order items" on public.fridge_order_items;
create policy "Members can view their own fridge order items"
on public.fridge_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.fridge_orders
    join public.members
      on members.id = fridge_orders.member_id
    where fridge_orders.id = fridge_order_items.fridge_order_id
      and members.user_id = auth.uid()
      and members.status <> 'canceled'
  )
  or exists (
    select 1
    from public.fridge_orders
    join public.gym_users
      on gym_users.gym_id = fridge_orders.gym_id
    where fridge_orders.id = fridge_order_items.fridge_order_id
      and gym_users.user_id = auth.uid()
      and gym_users.is_active = true
  )
);
