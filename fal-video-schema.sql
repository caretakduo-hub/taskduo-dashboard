begin;
create table public.video_generation_jobs (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 model text not null,
 platform text not null,
 format text not null,
 prompt text not null check(length(prompt) between 1 and 1500),
 options jsonb not null default '{}'::jsonb,
 status text not null check(status in ('submitting','queued','running','completed','failed','submission_unknown')),
 request_id text,
 status_url text,
 response_url text,
 asset_path text,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index video_generation_jobs_workspace_idx on public.video_generation_jobs(workspace_id,created_by,created_at desc);
create unique index video_generation_one_active on public.video_generation_jobs(workspace_id,created_by) where status in ('submitting','queued','running','submission_unknown');
alter table public.video_generation_jobs enable row level security;
revoke all on public.video_generation_jobs from anon,authenticated;
grant select on public.video_generation_jobs to authenticated;
grant all on public.video_generation_jobs to service_role;
create policy video_generation_jobs_read_own on public.video_generation_jobs for select to authenticated using(created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'posting'));
commit;
