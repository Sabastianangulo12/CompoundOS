alter table public.gyms
add column if not exists default_waiver_title text,
add column if not exists default_waiver_body text,
add column if not exists require_waiver_on_signup boolean not null default false;

alter table public.members
add column if not exists date_of_birth date,
add column if not exists address_line_1 text,
add column if not exists address_line_2 text,
add column if not exists city text,
add column if not exists state_region text,
add column if not exists postal_code text,
add column if not exists emergency_contact_name text,
add column if not exists emergency_contact_phone text,
add column if not exists emergency_contact_relationship text,
add column if not exists medical_notes text,
add column if not exists waiver_required boolean not null default false,
add column if not exists waiver_title text,
add column if not exists waiver_body text,
add column if not exists waiver_signature_name text,
add column if not exists waiver_signed_at timestamptz;

create index if not exists members_gym_joined_at_idx
on public.members (gym_id, joined_at desc);
