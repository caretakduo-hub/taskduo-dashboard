import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 let source:any,sb:any;
 try{
 const auth=req.headers.get('Authorization');if(!auth)return reply({error:'Unauthorized'},401);
 sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await sb.auth.getUser();if(!user)return reply({error:'Unauthorized'},401);
 const body=await req.json();const r=await sb.from('comp_sources').select('*').eq('id',body.source_id).single();source=r.data;if(!source)return reply({error:'Source not found'},404);
 const token=Deno.env.get('APIFY_API_TOKEN');if(!token)throw new Error('Collector API key is not configured.');
 let jobs=await sb.from('scrape_jobs').select('*').eq('user_id',user.id).eq('source_id',source.id).order('created_at',{ascending:false}).limit(1);
 // Repair runs started by the previous collector, which omitted source_id.
 if(!jobs.data?.length){jobs=await sb.from('scrape_jobs').select('*').eq('user_id',user.id).eq('url',source.url).is('source_id',null).order('created_at',{ascending:false}).limit(1);if(jobs.data?.[0]){const linked=await sb.from('scrape_jobs').update({source_id:source.id}).eq('id',jobs.data[0].id);if(linked.error)throw linked.error}}
 const job=jobs.data?.[0];if(!job){await sb.from('comp_sources').update({status:'error'}).eq('id',source.id);return reply({error:'No collection job found. Use Retry collection.'},409)}
 if(job.status==='IMPORTED')return reply({status:'ready'});
 const runRes=await fetch('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(job.apify_run_id),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});const runJson=await runRes.json();if(!runRes.ok)throw new Error('Could not check collector status.');const run=runJson.data;
 const running=['READY','RUNNING'].includes(run.status);if(running){await sb.from('comp_sources').update({status:'collecting'}).eq('id',source.id);await sb.from('scrape_jobs').update({status:run.status}).eq('id',job.id);return reply({status:'collecting'})}
 if(run.status!=='SUCCEEDED'){await sb.from('scrape_jobs').update({status:run.status,error_message:run.statusMessage||'Collection failed'}).eq('id',job.id);throw new Error(run.statusMessage||'Collection failed. Retry collection.')}
 const dataRes=await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId||job.dataset_id)}/items?clean=true&limit=25`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!dataRes.ok)throw new Error('Could not retrieve collected pages.');const items=await dataRes.json();
 const rows=items.filter((i:any)=>i.markdown||i.text).map((i:any,n:number)=>({source_id:source.id,workspace_id:source.workspace_id,external_id:String(i.url||n),content_url:i.url||source.url,title:String(i.metadata?.title||i.title||i.url||'Website page').slice(0,500),body_text:String(i.markdown||i.text).slice(0,50000),content_type:'webpage',raw_data:{collected_at:new Date().toISOString(),run_id:run.id}}));
 if(!rows.length)throw new Error('The collector returned no readable pages.');
 const saved=await sb.from('comp_content').upsert(rows,{onConflict:'source_id,external_id'});if(saved.error)throw saved.error;
 const ready=await sb.from('comp_sources').update({status:'ready',last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',source.id);if(ready.error)throw ready.error;
 const done=await sb.from('scrape_jobs').update({status:'IMPORTED',error_message:null}).eq('id',job.id);if(done.error)throw done.error;
 return reply({status:'ready',items:rows.length});
 }catch(e){if(source&&sb)await sb.from('comp_sources').update({status:'error'}).eq('id',source.id);return reply({error:e instanceof Error?e.message:'Collection failed'},502)}
});
