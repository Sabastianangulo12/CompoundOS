create or replace function public.create_member_fridge_unlock_session(
  selected_items_payload jsonb,
  expires_in_seconds integer default 90
)
returns table (
  id uuid,
  gym_id uuid,
  member_id uuid,
  selected_items jsonb,
  estimated_total_cents integer,
  status text,
  qr_token text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.members%rowtype;
  payload_item jsonb;
  product_row public.fridge_products%rowtype;
  quantity_value integer;
  safe_expiry_seconds integer := greatest(60, least(coalesce(expires_in_seconds, 90), 120));
  session_selected_items jsonb := '[]'::jsonb;
  session_total_cents integer := 0;
  generated_qr_token text := md5(
    auth.uid()::text || ':' || clock_timestamp()::text || ':' || random()::text
  );
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_typeof(coalesce(selected_items_payload, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(selected_items_payload, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one item before unlocking the fridge.';
  end if;

  select *
  into current_member
  from public.members
  where members.user_id = auth.uid()
    and members.status <> 'canceled'
  order by members.updated_at desc
  limit 1;

  if current_member.id is null then
    raise exception 'Member profile not found for authenticated user.';
  end if;

  for payload_item in
    select value from jsonb_array_elements(selected_items_payload)
  loop
    quantity_value := greatest(coalesce((payload_item ->> 'quantity')::integer, 0), 0);

    if quantity_value <= 0 then
      continue;
    end if;

    select *
    into product_row
    from public.fridge_products
    where fridge_products.id = (payload_item ->> 'productId')::uuid
      and fridge_products.gym_id = current_member.gym_id
      and fridge_products.is_active = true
    limit 1;

    if product_row.id is null then
      raise exception 'One or more selected products are no longer available.';
    end if;

    session_selected_items := session_selected_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', product_row.id,
        'name', product_row.name,
        'quantity', quantity_value,
        'unit_price_cents', product_row.price_cents,
        'total_price_cents', product_row.price_cents * quantity_value
      )
    );
    session_total_cents := session_total_cents + (product_row.price_cents * quantity_value);
  end loop;

  if session_total_cents <= 0 then
    raise exception 'Select at least one valid item before unlocking the fridge.';
  end if;

  return query
  insert into public.fridge_unlock_sessions (
    gym_id,
    member_id,
    selected_items,
    estimated_total_cents,
    status,
    qr_token,
    expires_at
  )
  values (
    current_member.gym_id,
    current_member.id,
    session_selected_items,
    session_total_cents,
    'pending',
    generated_qr_token,
    timezone('utc', now()) + make_interval(secs => safe_expiry_seconds)
  )
  returning
    fridge_unlock_sessions.id,
    fridge_unlock_sessions.gym_id,
    fridge_unlock_sessions.member_id,
    fridge_unlock_sessions.selected_items,
    fridge_unlock_sessions.estimated_total_cents,
    fridge_unlock_sessions.status,
    fridge_unlock_sessions.qr_token,
    fridge_unlock_sessions.expires_at,
    fridge_unlock_sessions.created_at;
end;
$$;

grant execute on function public.create_member_fridge_unlock_session(jsonb, integer) to authenticated;
