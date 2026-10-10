export const VIDEO_MODEL='fal-ai/wan-25-preview/text-to-video';
const LIMIT=50*1024*1024;
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function videoOptions(body:any){
 const prompt=String(body.prompt||'').trim();
 if(!prompt||prompt.length>1500)throw Error('Enter a video prompt up to 1,500 characters.');
 if(!['5','10'].includes(String(body.duration))||!['480p','720p','1080p'].includes(body.resolution)||!['16:9','9:16','1:1'].includes(body.aspect_ratio))throw Error('Choose a supported duration, resolution and aspect ratio.');
 const videoFormats:Record<string,string[]>={instagram:['reel'],facebook:['video','reel'],linkedin:['video'],youtube:['video','short'],telegram:['video']};
 if(!videoFormats[body.platform]?.includes(body.format))throw Error('Select a video or reel format first.');
 if(['reel','short'].includes(body.format)&&body.aspect_ratio!=='9:16')throw Error('Reels and Shorts require vertical 9:16 video.');
 if(body.platform==='youtube'&&body.format==='video'&&body.aspect_ratio!=='16:9')throw Error('YouTube video requires landscape 16:9.');
 return {prompt,duration:String(body.duration),resolution:body.resolution,aspect_ratio:body.aspect_ratio,enable_safety_checker:true};
}
export function queueURL(value:unknown,requestId:string){
 const url=new URL(String(value));
 if(url.origin!=='https://queue.fal.run'||url.username||url.password||!url.pathname.startsWith('/fal-ai/wan-25-preview/')||!url.pathname.includes('/requests/'+requestId))throw Error('The video provider returned an invalid queue URL.');
 return url.href;
}
export function mediaURL(value:unknown){
 const url=new URL(String(value));const host=url.hostname;
 if(url.protocol!=='https:'||url.username||url.password||!(host==='fal.media'||host.endsWith('.fal.media')||host==='storage.googleapis.com'))throw Error('The video provider returned an unsupported media URL.');
 return url.href;
}
async function downloadVideo(url:string){
 let current=mediaURL(url),res:Response|undefined;
 for(let i=0;i<4;i++){res=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(65000)});if([301,302,303,307,308].includes(res.status)){current=mediaURL(new URL(res.headers.get('location')||'',current).href);continue}break}
 if(!res?.ok||!res.body)throw Error('Video download failed. Check status again to retry without generating another video.');
 if(Number(res.headers.get('content-length')||0)>LIMIT)throw Error('Generated video exceeds the 50 MB upload limit.');
 const reader=res.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>LIMIT){await reader.cancel();throw Error('Generated video exceeds the 50 MB upload limit.')}chunks.push(value)}
 if(!length)throw Error('The video provider returned an empty video.');
 const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result;
}
export async function handleVideo(body:any,admin:any,userId:string,key:string|undefined,reply:(data:unknown,status?:number)=>Response){
 if(!key)return reply({error:'fal.ai is not configured. Add FAL_KEY in Supabase → Edge Functions → Secrets, then retry.'},503);
 const jobs=()=>admin.from('video_generation_jobs');
 const read=async(id:string)=>{const r=await jobs().select('*').eq('id',id).eq('workspace_id',body.workspace_id).eq('created_by',userId).maybeSingle();if(r.error)throw Error('Could not load your video job.');return r.data};
 const update=async(id:string,patch:any)=>{const r=await jobs().update({...patch,updated_at:new Date().toISOString()}).eq('id',id).eq('workspace_id',body.workspace_id).eq('created_by',userId);if(r.error)throw Error('Could not save the video job state.');};
 const publicJob=async(job:any)=>{let asset=null;if(job.asset_path){const signed=await admin.storage.from('post-media').createSignedUrl(job.asset_path,3600);if(signed.error)throw Error('Could not create a private video preview.');asset={path:job.asset_path,url:signed.data.signedUrl,type:'video',slot:0,provider:'fal.ai',model:job.model,job_id:job.id,ai:true}}return {job_id:job.id,status:job.status,error:job.error_message||undefined,platform:job.platform,format:job.format,options:job.options,asset}};
 try{
 if(!['video_submit','video_status'].includes(body.action))return reply({error:'Unsupported video action.'},400);
 if(!uuid(body.job_id))return reply({error:'Valid video job ID required.'},400);
 if(body.action==='video_submit'){
  let options;try{options=videoOptions(body)}catch(e){return reply({error:(e as Error).message},400)}
  const existing=await read(body.job_id);if(existing)return reply(await publicJob(existing));
  const limit=await admin.rpc('claim_ai_generation',{caller_id:userId});if(limit.error||!limit.data)return reply({error:'Generation limit reached. Try again in a minute.'},429);
  const row={id:body.job_id,workspace_id:body.workspace_id,created_by:userId,model:VIDEO_MODEL,platform:body.platform,format:body.format,prompt:options.prompt,options,status:'submitting'};
  const inserted=await jobs().insert(row);if(inserted.error){const duplicate=await read(body.job_id);if(duplicate)return reply(await publicJob(duplicate));const active=await jobs().select('id').eq('workspace_id',body.workspace_id).eq('created_by',userId).in('status',['submitting','queued','running','submission_unknown']).maybeSingle();return reply({error:'A video job is already active. Resume it before submitting another.',job_id:active.data?.id},409)}
  let response:Response;
  try{response=await fetch('https://queue.fal.run/'+VIDEO_MODEL,{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify(options),signal:AbortSignal.timeout(30000)})}catch{await update(row.id,{status:'submission_unknown',error_message:'Submission status is uncertain. Do not submit again; check your fal.ai request history to avoid duplicate charges.'});return reply(await publicJob(await read(row.id)))}
  if(!response.ok){const message=response.status===401||response.status===403?'fal.ai rejected the server API key or model access.':response.status===429?'fal.ai credits or rate limit reached. Check your fal.ai account.':'fal.ai rejected video generation. Review the prompt and settings.';await update(row.id,{status:'failed',error_message:message});return reply(await publicJob(await read(row.id)))}
  const data=await response.json();
  try{if(typeof data.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,120}$/.test(data.request_id))throw Error();const status_url=queueURL(data.status_url,data.request_id),response_url=queueURL(data.response_url,data.request_id);await update(row.id,{status:'queued',request_id:data.request_id,status_url,response_url})}catch{await update(row.id,{status:'submission_unknown',error_message:'fal.ai accepted this request, but tracking could not be saved. Check fal.ai request history before generating again.'})}
  return reply(await publicJob(await read(row.id)));
 }
 const job=await read(body.job_id);if(!job)return reply({error:'Video job not found.'},404);
 if(['completed','failed','submission_unknown','submitting'].includes(job.status))return reply(await publicJob(job));
 const response=await fetch(queueURL(job.status_url,job.request_id),{headers:{Authorization:'Key '+key},signal:AbortSignal.timeout(20000)});
 if(!response.ok)return reply({error:'Could not check fal.ai status. Retry status; no new video will be generated.'},502);
 const status=await response.json();
 if(status.error){await update(job.id,{status:'failed',error_message:'fal.ai could not generate this video. Review the prompt and your fal.ai request history.'});return reply(await publicJob(await read(job.id)))}
 if(status.status==='IN_QUEUE'||status.status==='IN_PROGRESS'){await update(job.id,{status:status.status==='IN_QUEUE'?'queued':'running'});return reply({...await publicJob(await read(job.id)),queue_position:status.queue_position})}
 if(status.status!=='COMPLETED')return reply({error:'Unexpected provider status. Retry status later.'},502);
 const result=await fetch(queueURL(job.response_url,job.request_id),{headers:{Authorization:'Key '+key},signal:AbortSignal.timeout(25000)});
 if(!result.ok){if(result.status===422||result.status===400){await update(job.id,{status:'failed',error_message:'The video request failed or was blocked by the provider. Review fal.ai request history.'});return reply(await publicJob(await read(job.id)))}return reply({error:'Video result is not available yet. Retry status.'},502)}
 const data=await result.json();if(!data.video?.url){await update(job.id,{status:'failed',error_message:'fal.ai returned no video.'});return reply(await publicJob(await read(job.id)))}
 const bytes=await downloadVideo(data.video.url),path=`${userId}/fal-${job.id}.mp4`;
 const upload=await admin.storage.from('post-media').upload(path,bytes,{contentType:'video/mp4',upsert:true});if(upload.error)throw Error('Video was generated but could not be saved. Retry status to save the same result.');
 await update(job.id,{status:'completed',asset_path:path,error_message:null});return reply(await publicJob(await read(job.id)));
 }catch(e){return reply({error:e instanceof Error?e.message:'Video generation request failed. Retry status before submitting another job.'},502)}
}
