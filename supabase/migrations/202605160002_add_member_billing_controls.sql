alter table public.members
add column if not exists frozen_until date,
add column if not exists canceled_at timestamptz;

create index if not exists members_status_frozen_until_idx
on public.members (status, frozen_until);
