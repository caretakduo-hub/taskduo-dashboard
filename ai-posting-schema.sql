alter table public.social_posts add column if not exists creative_data jsonb not null default '{}'::jsonb;
create table if not exists public.ai_generation_limits(user_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null default now(), requests integer not null default 0);
alter table public.ai_generation_limits enable row level security;
revoke all on public.ai_generation_limits from anon,authenticated;
grant all on public.ai_generation_limits to service_role;
create or replace function public.claim_ai_generation(caller_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if caller_id is null then return false; end if;
 insert into public.ai_generation_limits(user_id,window_start,requests) values(caller_id,now(),1)
 on conflict(user_id) do update set window_start=case when ai_generation_limits.window_start<now()-interval '1 minute' then now() else ai_generation_limits.window_start end, requests=case when ai_generation_limits.window_start<now()-interval '1 minute' then 1 else ai_generation_limits.requests+1 end
 returning requests into n;
 return n<=8;
end;$$;
revoke all on function public.claim_ai_generation(uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_generation(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-media','post-media',false,52428800,array['image/png','image/jpeg','image/webp','video/mp4','video/webm']) on conflict(id) do nothing;
create policy "users read own post media" on storage.objects for select to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "users upload own post media" on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
