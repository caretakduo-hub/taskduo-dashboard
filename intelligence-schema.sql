begin;
create table if not exists public.creative_brands (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), audience text not null default '', voice text not null default '', description text not null default '', website text not null default '', created_at timestamptz not null default now()
);
create index if not exists creative_brands_workspace_idx on public.creative_brands(workspace_id);
alter table public.creative_brands enable row level security;
grant select,insert,update,delete on public.creative_brands to authenticated;
create policy creative_brands_read on public.creative_brands for select to authenticated using (public.has_workspace_access(workspace_id,'posting') or public.has_workspace_access(workspace_id,'ads') or public.has_workspace_access(workspace_id,'socialmanage'));
create policy creative_brands_write on public.creative_brands for all to authenticated using (public.has_workspace_access(workspace_id,'posting',true) or public.has_workspace_access(workspace_id,'ads',true) or public.has_workspace_access(workspace_id,'socialmanage',true)) with check (public.has_workspace_access(workspace_id,'posting',true) or public.has_workspace_access(workspace_id,'ads',true) or public.has_workspace_access(workspace_id,'socialmanage',true));
alter table public.social_posts drop constraint social_posts_platform_check;
alter table public.social_posts add constraint social_posts_platform_check check(platform in ('youtube','instagram','linkedin','facebook','telegram'));
alter table public.social_posts drop constraint social_posts_post_type_check;
alter table public.social_posts add constraint social_posts_post_type_check check ((platform='instagram' and post_type in ('post','image','carousel','reel','story')) or (platform='facebook' and post_type in ('text','image','video','carousel','story','reel')) or (platform='linkedin' and post_type in ('text','image','video','carousel')) or (platform='youtube' and post_type in ('video','short','community')) or (platform='telegram' and post_type in ('text','image','video')));
update public.workspace_access set sections=array(select distinct case when s='aiintel' then 'posting' else s end from unnest(sections) s) where 'aiintel'=any(sections);
create policy intelligence_sources_read on public.comp_sources for select to authenticated using (public.has_workspace_access(workspace_id,'postingintel') or public.has_workspace_access(workspace_id,'quality') or public.has_workspace_access(workspace_id,'socialmanage'));
create policy intelligence_content_read on public.comp_content for select to authenticated using (public.has_workspace_access(workspace_id,'postingintel') or public.has_workspace_access(workspace_id,'quality') or public.has_workspace_access(workspace_id,'socialmanage'));
create policy intelligence_plan_read on public.social_posts for select to authenticated using (public.has_workspace_access(workspace_id,'socialmanage'));
create policy intelligence_plan_insert on public.social_posts for insert to authenticated with check (created_by=(select auth.uid()) and public.has_workspace_access(workspace_id,'socialmanage',true));
create policy intelligence_plan_update on public.social_posts for update to authenticated using (public.has_workspace_access(workspace_id,'socialmanage',true)) with check (public.has_workspace_access(workspace_id,'socialmanage',true));
update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/webm'] where id='post-media';
commit;
