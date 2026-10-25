import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"https://www.taskduo.store","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return out(405,{error:"Method not allowed"});
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return out(401,{error:"Sign in required"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("BUFFER_API_KEY");
 if(!url||!anon||!key)return out(503,{error:"Buffer or Supabase configuration missing"});
 const supabase=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
 const {data:{user},error}=await supabase.auth.getUser(bearer.slice(7));
 if(error||!user)return out(401,{error:"Invalid session"});
 let body:any={};try{body=await req.json()}catch{return out(400,{error:"Invalid JSON"})}
 if(!["channels","publish_now","post_status"].includes(body.action))return out(400,{error:"Unsupported action"});
 async function graph(query:string){const r=await fetch("https://api.buffer.com",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({query})});const d=await r.json();if(!r.ok||d.errors)throw new Error(d.errors?.[0]?.message||"Buffer request failed");return d.data}
 try{
 if(body.action==="post_status"){
 if(typeof body.post_id!=="string"||!/^[-0-9a-f]{36}$/i.test(body.post_id))return out(400,{error:"Valid saved post required"});
 const {data:p,error:pe}=await supabase.from("social_posts").select("*").eq("id",body.post_id).eq("created_by",user.id).eq("platform","instagram").single();
 if(pe||!p)return out(404,{error:"Instagram post not found"});
 const id=p.creative_data?.buffer_post_id;if(typeof id!=="string"||!id)return out(409,{error:"This post has no confirmed Buffer tracking ID. A live link cannot be retrieved yet."});
 const account=await graph("query { account { organizations { id name } } }");const allowed=[];
 for(const org of account?.account?.organizations||[]){const data=await graph('query { channels(input: { organizationId: '+JSON.stringify(org.id)+' }) { id name service } }');for(const ch of data.channels||[])if(ch.service==="instagram"&&String(ch.name||"").replace(/^@/,"").toLowerCase()==="taskduo")allowed.push(ch.id)}
 const data=await graph('query { post(input: { id: '+JSON.stringify(id)+' }) { id status sentAt dueAt externalLink channelId channelService } }');const remote=data?.post;
 if(!remote||!allowed.includes(remote.channelId)||remote.channelService!=="instagram")return out(403,{error:"Publishing channel does not match the connected TaskDuo Instagram channel"});
 let link=null;try{const u=new URL(remote.externalLink);if(u.protocol==="https:"&&!u.username&&!u.password&&(u.hostname==="instagram.com"||u.hostname.endsWith(".instagram.com")))link=u.href}catch{}
 const patch:any={creative_data:{...(p.creative_data||{}),buffer_status:remote.status,buffer_checked_at:new Date().toISOString()}};
 if(link)patch.external_post_url=link;
 if(remote.sentAt){patch.status="published";patch.published_at=remote.sentAt}
 if(!remote.sentAt&&remote.dueAt&&p.status!=="published"){patch.status="scheduled";patch.scheduled_for=remote.dueAt}
 if(["error","failed"].includes(String(remote.status).toLowerCase()))patch.status="failed";
 const saved=await supabase.from("social_posts").update(patch).eq("id",p.id).eq("created_by",user.id);if(saved.error)return out(502,{error:"Could not save refreshed post link"});
 return out(200,{external_post_url:link,published:!!remote.sentAt,status:remote.status});
 }
 if(body.action==="publish_now"){
   if(typeof body.post_id!=="string"||!/^[-0-9a-f]{36}$/i.test(body.post_id))return out(400,{error:"Save a post first"});
   const {data:p,error:pe}=await supabase.from("social_posts").select("*").eq("id",body.post_id).eq("created_by",user.id).eq("platform","instagram").single();
   if(pe||!p)return out(404,{error:"Instagram post not found"});
   if(!["draft","approved"].includes(p.status))return out(409,{error:"Post already submitted or not eligible. Save a fresh draft."});
   if(!["post","image"].includes(p.post_type))return out(400,{error:"Initial Buffer publishing supports single-image Instagram posts only"});
   const media=(p.creative_data?.assets||[]).filter((a:any)=>a.type==="image"&&typeof a.path==="string");
   if(media.length!==1||(p.creative_data?.assets||[]).length!==1)return out(400,{error:"Attach exactly one image before publishing"});
   if(!media[0].path.startsWith(user.id+"/"))return out(403,{error:"Media ownership mismatch"});
   const {data:signed,error:se}=await supabase.storage.from("post-media").createSignedUrl(media[0].path,604800);
   if(se||!signed?.signedUrl)return out(400,{error:"Unable to access image"});
   const account=await graph("query { account { organizations { id name } } }");
   const matches=[];
   for(const org of account?.account?.organizations||[]){const data=await graph('query { channels(input: { organizationId: '+JSON.stringify(org.id)+' }) { id name service } }');for(const ch of data.channels||[])if(ch.service==="instagram"&&String(ch.name||"").replace(/^@/,"").toLowerCase()==="taskduo")matches.push(ch)}
   if(matches.length!==1)return out(409,{error:"Could not uniquely identify Instagram @taskduo in Buffer"});
   const {data:claimed,error:ce}=await supabase.from("social_posts").update({status:"publishing"}).eq("id",p.id).eq("status",p.status).eq("created_by",user.id).select("id").maybeSingle();
   if(ce||!claimed)return out(409,{error:"Post is already being processed or permission denied"});
   let accepted=false;
   try{
    const caption=[p.caption||p.body||"",...(p.hashtags||[])].filter(Boolean).join("\\n\\n").slice(0,2200);
    const query="mutation { createPost(input: { text: "+JSON.stringify(caption)+", channelId: "+JSON.stringify(matches[0].id)+", schedulingType: automatic, mode: shareNow, assets: [{ image: { url: "+JSON.stringify(signed.signedUrl)+" } }], metadata: { instagram: { type: post, shouldShareToFeed: true } } }) { ... on PostActionSuccess { post { id status sentAt externalLink dueAt } } ... on MutationError { message } } }";
    const result=await graph(query);const posted=result?.createPost?.post;
    if(!posted?.id)throw new Error(result?.createPost?.message||"Buffer did not accept post");
    accepted=true;
    const creative={...(p.creative_data||{}),buffer_post_id:posted.id,buffer_status:posted.status,buffer_submitted_at:new Date().toISOString()};
    const finalStatus=posted.sentAt?"published":"scheduled";
    const {error:ue}=await supabase.from("social_posts").update({status:finalStatus,published_at:posted.sentAt||null,external_post_url:(()=>{try{const u=new URL(posted.externalLink);return u.protocol==="https:"&&!u.username&&!u.password&&(u.hostname==="instagram.com"||u.hostname.endsWith(".instagram.com"))?u.href:null}catch{return null}})(),scheduled_for:posted.dueAt||p.scheduled_for||null,creative_data:creative}).eq("id",p.id).eq("status","publishing");
    return out(200,{accepted:true,buffer_post_id:posted.id,buffer_status:posted.status,tracking_saved:!ue,published:!!posted.sentAt});
   }catch(e){
    if(!accepted)await supabase.from("social_posts").update({status:p.status}).eq("id",p.id).eq("status","publishing");
    throw e;
   }
 }
 const account=await graph("query { account { organizations { id name } } }");
 const orgs=account?.account?.organizations||[];
 const channels=[];
 for(const org of orgs){const data=await graph('query { channels(input: { organizationId: '+JSON.stringify(org.id)+' }) { id name service } }');for(const ch of data.channels||[])channels.push({...ch,organizationId:org.id})}
 return out(200,{connected:true,channels});
 }catch(e){return out(502,{error:"Buffer connection failed",detail:String(e instanceof Error?e.message:e).slice(0,250)})}
});