alter table public.member_follow_up_tasks
add column if not exists task_type text not null default 'general';

alter table public.member_follow_up_tasks
drop constraint if exists member_follow_up_tasks_task_type_check;

alter table public.member_follow_up_tasks
add constraint member_follow_up_tasks_task_type_check
check (task_type in ('general', 'billing', 'retention', 'front_desk'));

create index if not exists member_follow_up_tasks_gym_type_status_idx
on public.member_follow_up_tasks (gym_id, task_type, status, priority, created_at desc);
