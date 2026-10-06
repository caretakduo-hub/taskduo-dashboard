import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 let sb:any,source:any;
 try{
 const auth=req.headers.get('Authorization');if(!auth)return reply({error:'Unauthorized'},401);
 sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});const {data:{user}}=await sb.auth.getUser();if(!user)return reply({error:'Unauthorized'},401);
 const body=await req.json();const r=await sb.from('comp_sources').select('*').eq('id',body.source_id).single();source=r.data;if(!source)return reply({error:'Source not found'},404);
 if(source.platform!=='website')throw new Error('This collector supports public websites. Social platform collectors need a separate integration.');
 const target=new URL(source.url);if(!['https:','http:'].includes(target.protocol))throw new Error('Only HTTP and HTTPS websites are supported.');
 if(!target.hostname.includes('.')||target.hostname==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(target.hostname)||target.hostname.includes(':')||target.username||target.password)throw new Error('Enter a public website URL.');
 const token=Deno.env.get('APIFY_API_TOKEN');if(!token)throw new Error('Collector API key is not configured.');
 const existing=await sb.from('scrape_jobs').select('id,status').eq('source_id',source.id).in('status',['READY','RUNNING']).limit(1);if(existing.data?.length)return reply({status:'collecting',message:'An existing job is already running. Use Check results.'});
 const starting=await sb.from('comp_sources').update({status:'collecting'}).eq('id',source.id);if(starting.error)throw starting.error;
 const res=await fetch('https://api.apify.com/v2/acts/apify~website-content-crawler/runs',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({startUrls:[{url:target.toString()}],maxCrawlPages:25,crawlerType:'playwright:adaptive',saveHtml:false,saveMarkdown:true}),signal:AbortSignal.timeout(30000)});const json=await res.json();if(!res.ok)throw new Error(json.error?.message||'Collector could not start.');const run=json.data;
 const insert=await sb.from('scrape_jobs').insert({user_id:user.id,url:target.toString(),source_id:source.id,apify_run_id:run.id,dataset_id:run.defaultDatasetId,status:run.status||'READY'});if(insert.error)throw insert.error;
 return reply({status:'collecting',id:run.id});
 }catch(e){if(source&&sb)await sb.from('comp_sources').update({status:'error'}).eq('id',source.id);return reply({error:e instanceof Error?e.message:'Collector failed.'},502)}
});
