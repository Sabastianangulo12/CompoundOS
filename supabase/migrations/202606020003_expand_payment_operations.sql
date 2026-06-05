alter table public.payments
add column if not exists late_fee_cents integer not null default 0 check (late_fee_cents >= 0),
add column if not exists tax_cents integer not null default 0 check (tax_cents >= 0),
add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0),
add column if not exists manual_payment_note text,
add column if not exists payment_method_label text;

create index if not exists payments_gym_status_created_idx
on public.payments (gym_id, status, created_at desc);

create index if not exists payments_gym_invoice_idx
on public.payments (gym_id, invoice_number)
where invoice_number is not null;
