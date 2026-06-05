alter table public.fridge_products
add column if not exists category text not null default 'drinks_fridge';

alter table public.fridge_products
drop constraint if exists fridge_products_category_check;

alter table public.fridge_products
add constraint fridge_products_category_check
check (
  category in (
    'drinks_fridge',
    'meal_prep_fridge',
    'protein_candy',
    'tclc_merch'
  )
);

create index if not exists fridge_products_gym_category_active_idx
on public.fridge_products (gym_id, category, is_active, sort_order asc, created_at desc);
