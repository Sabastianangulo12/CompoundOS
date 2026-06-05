create unique index if not exists fridge_unlock_sessions_qr_token_idx
on public.fridge_unlock_sessions (qr_token);
