create table public.ad_generations (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 package jsonb not null check (jsonb_typeof(package)='object'),
 assets jsonb not null default '[]'::jsonb check (jsonb_typeof(assets)='array')
);
create index ad_generations_owner_history_idx on public.ad_generations(workspace_id,created_by,created_at desc,id);
alter table public.ad_generations enable row level security;
revoke all on public.ad_generations from anon,authenticated;
grant select,insert,update on public.ad_generations to authenticated;
grant all on public.ad_generations to service_role;
create policy "read own ads with section access" on public.ad_generations for select to authenticated using (
 created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'ads',false)
);
create policy "save own ads with editing access" on public.ad_generations for insert to authenticated with check (
 created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'ads',true)
);
create policy "update own ads with editing access" on public.ad_generations for update to authenticated using (
 created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'ads',true)
) with check (
 created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'ads',true)
);
