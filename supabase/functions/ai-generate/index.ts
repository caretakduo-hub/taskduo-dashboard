import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
const formats:Record<string,string[]>={instagram:['post','image','carousel','reel','story'],facebook:['text','image','video','carousel','story','reel'],linkedin:['text','image','video','carousel'],youtube:['video','short','community']};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 const auth=req.headers.get('Authorization');if(!auth)return reply({error:'Sign in first.'},401);
 const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
 const {data:{user},error}=await sb.auth.getUser();if(error||!user)return reply({error:'Sign in again.'},401);
 const body=await req.json();const {data:ws}=await sb.from('workspaces').select('id').eq('id',body.workspace_id).eq('owner_id',user.id).single();if(!ws)return reply({error:'Workspace access denied.'},403);
 const key=Deno.env.get('OPENAI_API_KEY');if(body.action==='capabilities')return reply({content:!!key,images:!!key,video:false,publishing:false});
 if(!key)return reply({error:'OpenAI generation is not configured. Add OPENAI_API_KEY to the Supabase function secrets.'},503);
 if(!formats[body.platform]?.includes(body.format))return reply({error:'Unsupported channel or format.'},400);
 if(!['content','image'].includes(body.action))return reply({error:'Unknown generation action.'},400);
 // Atomic per-user limit avoids repeated concurrent generation requests.
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:allowed,error:limitError}=await admin.rpc('claim_ai_generation',{caller_id:user.id});if(limitError||!allowed)return reply({error:'Generation limit reached. Please try again in a minute.'},429);
 const id=crypto.randomUUID();const model=body.action==='image'?(Deno.env.get('OPENAI_IMAGE_MODEL')||'gpt-image-2.5-flare'):(Deno.env.get('OPENAI_TEXT_MODEL')||'gpt-4.1-mini');
 let payload:Record<string,unknown>,endpoint:string;
 if(body.action==='image'){
 const prompt=String(body.prompt||'').trim();if(!prompt||prompt.length>6000)return reply({error:'Enter an image prompt up to 6,000 characters.'},400);
 if(!['1024x1024','1024x1280','864x1536','1536x864'].includes(body.size))return reply({error:'Unsupported image size.'},400);
 endpoint='images/generations';payload={model,prompt:`Create one finished social media creative for ${body.platform} ${body.format}. ${prompt}\nUse clean, readable composition. Do not invent statistics or testimonials.`,size:body.size,quality:'medium',n:1,output_format:'png'};
 }else{
 const brief=String(body.brief||'').trim();if(!brief||brief.length>6000)return reply({error:'Enter a brief up to 6,000 characters.'},400);
 const schema={type:'object',properties:{title:{type:'string'},body:{type:'string'},caption:{type:'string'},hashtags:{type:'array',items:{type:'string'},maxItems:12},image_prompt:{type:'string'},video_prompt:{type:'string'},slides:{type:'array',maxItems:6,items:{type:'object',properties:{title:{type:'string'},body:{type:'string'},image_prompt:{type:'string'}},required:['title','body','image_prompt'],additionalProperties:false}}},required:['title','body','caption','hashtags','image_prompt','video_prompt','slides'],additionalProperties:false};
 endpoint='responses';payload={model,store:false,instructions:'You are TaskDuo’s social content creator. Produce original, finished copy, never a fill-in template. Do not invent claims, prices, metrics or testimonials. Follow the user language and tone. Return hashtags with #. For carousel produce 4–6 numbered slide entries with coherent copy and a consistent image style. For story produce 3–5 story frames. For reels/shorts/video write a complete timed script, shot list, on-screen text and CTA in body, plus publish-ready caption or description in caption, with a production prompt in video_prompt and thumbnail prompt in image_prompt. Short/reel is vertical 9:16 and under 60 seconds; YouTube long video is 16:9. For text/image/post/community return finished caption in body and no slides. Titles must be channel-appropriate. No claims of having created a finished video.',input:JSON.stringify({channel:body.platform,format:body.format,tone:String(body.tone||'Professional').slice(0,80),brief}),text:{format:{type:'json_schema',name:'social_post',strict:true,schema}},max_output_tokens:3500};
 }
 const res=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(140000)});
 const data=await res.json();if(!res.ok){console.error('OpenAI request failed',res.status,data.error?.code);return reply({error:res.status===429?'OpenAI quota or rate limit reached. Check your API billing and retry later.':'OpenAI could not complete this request. Check the server model configuration and API access.'},res.status===429?429:502)}
 if(body.action==='image'){const image=data.data?.[0]?.b64_json;if(!image)return reply({error:'No image was returned.'},502);return reply({generation_id:id,model,image_base64:image})}
 const output=data.output?.flatMap((o:any)=>o.content||[]).find((c:any)=>c.type==='output_text')?.text;if(!output)return reply({error:'No content returned. Try a different brief.'},502);
 return reply({...JSON.parse(output),generation_id:id,model});
 }catch(e){console.error('AI generation failed',e instanceof Error?e.name:'unknown');return reply({error:'Generation failed or timed out. Your existing draft is unchanged.'},500)}
});
