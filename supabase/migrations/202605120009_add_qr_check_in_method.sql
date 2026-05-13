alter table public.check_ins
drop constraint if exists check_ins_check_in_method_check;

alter table public.check_ins
add constraint check_ins_check_in_method_check
check (check_in_method in ('manual', 'qr'));
