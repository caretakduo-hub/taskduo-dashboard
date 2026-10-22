import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 try{
 const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return respond({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!;
 const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await db.auth.getUser(auth.slice(7));if(userError||!user)return respond({error:"Invalid session"},401);
 const {keyword="",niche="",country="",min_followers=0,follower_range=null,similar_url=null,platforms=[],result_count=20,workspace_id,runs=null}=await req.json();
 if(!workspace_id||typeof workspace_id!=="string")return respond({error:"Workspace required"},400);
 const {data:workspace,error:wError}=await db.from("workspaces").select("id").eq("id",workspace_id).eq("owner_id",user.id).maybeSingle();
 if(wError||!workspace)return respond({error:"Workspace access denied"},403);
 if(!Array.isArray(platforms)||!platforms.some((p:string)=>["youtube","instagram","linkedin"].includes(p)))return respond({influencers:[],notice:"Choose a supported platform."});
 const requested=Number(result_count);if(!Number.isInteger(requested)||requested<1||requested>100)return respond({error:"Choose 1 to 100 results"},400);
 const q=[String(keyword).trim().slice(0,120),String(niche).trim().slice(0,80)].filter(Boolean).join(" ");
 if(!q)return respond({influencers:[],notice:"Enter a keyword or topic to search creators."});
 const range=String(follower_range??min_followers);const match=/^(\d+)-(\d+)$/.exec(range);const threshold=Number(match?match[1]:range);const maxFollowers=match?Number(match[2]):null;if(match&&maxFollowers<threshold)return respond({error:"Invalid follower range"},400);if(!Number.isFinite(threshold)||threshold<0||threshold>1000000000)return respond({error:"Invalid follower threshold"},400);
 const region=String(country||"").toUpperCase();if(region&&!/^[A-Z]{2}$/.test(region))return respond({error:"Invalid country code"},400);

 let youtubeCreators:any[]=[];
 let apifyCreators:any[]=[];
 const pending:any[]=[];
 const notices:string[]=[];
 const apifyPlatforms=[...new Set<string>(platforms.filter((p:string)=>p==="instagram"||p==="linkedin"))];
 const polling=Array.isArray(runs);
 const candidateLimit=Math.min(100,Math.max(25,requested*3));
 const token=Deno.env.get("APIFY_API_TOKEN");
 if(apifyPlatforms.length&&!token)notices.push("Instagram/LinkedIn discovery unavailable: APIFY_API_TOKEN is not configured.");
 const actorMap:Record<string,string>={instagram:"apify~instagram-scraper",linkedin:"johnvc~linkedin-people-search-api"};
 const runList=Array.isArray(runs)?runs.filter((r:any)=>apifyPlatforms.includes(r.platform)&&/^[a-zA-Z0-9]{8,32}$/.test(r.id)).slice(0,2):[];
 const getJson=async(url:string,init:RequestInit={})=>{const response=await fetch(url,{...init,headers:{Authorization:"Bearer "+token,...(init.headers||{})},signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error("Apify API: "+(data.error?.message||response.status));return data;};
 for(const platform of apifyPlatforms){
  if(!token)continue;
  if(polling&&!runList.some((r:any)=>r.platform===platform))continue;
  try{
   let run=runList.find((x:any)=>x.platform===platform);
   if(!run){
    const input=platform==="instagram"?{search:q,searchType:"user",searchLimit:candidateLimit,resultsType:"details",resultsLimit:1}:{keywords:q,limit:candidateLimit,location:region||undefined};
    const actor=actorMap[platform];
    const data=await getJson("https://api.apify.com/v2/acts/"+actor+"/runs?maxTotalChargeUsd=1&timeout=180",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
    run={platform,id:data.data.id};
   }
   const state=(await getJson("https://api.apify.com/v2/actor-runs/"+encodeURIComponent(run.id))).data;
   if(["READY","RUNNING"].includes(state.status)){pending.push(run);continue;}
   if(state.status!=="SUCCEEDED"){notices.push(platform+" collection "+String(state.status||"failed").toLowerCase());continue;}
   const items=await getJson("https://api.apify.com/v2/datasets/"+encodeURIComponent(state.defaultDatasetId)+"/items?clean=true&limit="+candidateLimit);
   if(!Array.isArray(items)){notices.push(platform+" returned an unexpected dataset");continue;}
   for(const item of items){
    if(item.error||item.errorDescription)continue;
    const x=item.owner||item.author||item.profile||item;
    const username=String(x.username||x.userName||x.handle||x.publicIdentifier||"").replace(/^@/,"");
    const name=String(x.fullName||x.full_name||x.name||x.title||[x.firstName,x.lastName].filter(Boolean).join(" ")||username).slice(0,180);
    const rawUrl=x.url||x.profileUrl||x.profile_url||x.linkedinUrl||x.instagramUrl||x.profileLink;
    const profileUrl=rawUrl|| (platform==="instagram"&&username?"https://www.instagram.com/"+encodeURIComponent(username)+"/":platform==="linkedin"&&username?"https://www.linkedin.com/in/"+encodeURIComponent(username)+"/":"");
    let validUrl="";try{const u=new URL(profileUrl);const host=platform==="instagram"?"instagram.com":"linkedin.com";if(u.protocol==="https:"&&(u.hostname===host||u.hostname.endsWith("."+host))&&!u.username&&!u.password)validUrl=u.href}catch{}
    if(!validUrl||!name)continue;
    const count=x.followersCount??x.followers_count??x.followerCount??x.followers??x.subscribersCount??null;
    const followers=typeof count==="number"&&Number.isFinite(count)?count:typeof count==="string"&&/^\d+$/.test(count)?Number(count):null;
    if(threshold>0&&(followers===null||followers<threshold))continue;
    if(maxFollowers!==null&&(followers===null||followers>maxFollowers))continue;
    const countryValue=String(x.countryCode||x.country_code||"").toUpperCase();
    if(region&&countryValue&&countryValue!==region)continue;
    apifyCreators.push({id:platform+":"+username+":"+validUrl,platform,name,handle:username,niche:String(niche||x.headline||x.category||"Not available").slice(0,160),profile_url:validUrl,followers:followers??"Not available",engagement_rate:"Not available",country:countryValue||null,thumbnail_url:x.profilePicUrl||x.profilePicture||x.profileImage||null});
   }
  }catch(e){notices.push(platform+": "+String(e instanceof Error?e.message:e).slice(0,180));}
 }
 if(platforms.includes("youtube")&&!polling){
  try{
   const key=Deno.env.get("YOUTUBE_API_KEY");if(!key)throw Error("YOUTUBE_API_KEY is not configured");
   const seen=new Set<string>();let nextPage:string|undefined;let pages=0;const started=Date.now();
   while(youtubeCreators.length<requested&&pages<5&&Date.now()-started<45000){
    const search=new URL("https://www.googleapis.com/youtube/v3/search");
    search.searchParams.set("part","snippet");search.searchParams.set("type","channel");
    search.searchParams.set("maxResults",String(Math.min(50,candidateLimit)));search.searchParams.set("q",q);search.searchParams.set("key",key);
    if(region)search.searchParams.set("regionCode",region);if(nextPage)search.searchParams.set("pageToken",nextPage);
    const result=await fetch(search,{signal:AbortSignal.timeout(15000)});const body=await result.json();
    if(!result.ok)throw Error(body?.error?.message||"YouTube API search failed");
    const ids:string[]=[];
    for(const item of body.items||[]){const id=item.id?.channelId;if(id&&!seen.has(id)){seen.add(id);ids.push(id)}}
    if(ids.length){
     const details=new URL("https://www.googleapis.com/youtube/v3/channels");
     details.searchParams.set("part","snippet,statistics");details.searchParams.set("id",ids.join(","));details.searchParams.set("key",key);
     const channelResponse=await fetch(details,{signal:AbortSignal.timeout(15000)});const channelBody=await channelResponse.json();
     if(!channelResponse.ok)throw Error(channelBody?.error?.message||"YouTube channel details failed");
     for(const x of channelBody.items||[]){
      const count=Number(x.statistics?.subscriberCount),known=!x.statistics?.hiddenSubscriberCount&&Number.isFinite(count);
      if(region&&x.snippet?.country!==region)continue;
      if(threshold>0&&(!known||count<threshold))continue;
      if(maxFollowers!==null&&(!known||count>maxFollowers))continue;
      youtubeCreators.push({id:x.id,platform:"youtube",name:x.snippet?.title||"",handle:x.snippet?.customUrl||"",niche:String(niche||"YouTube creator"),description:x.snippet?.description||"",profile_url:"https://www.youtube.com/channel/"+encodeURIComponent(x.id),followers:x.statistics?.hiddenSubscriberCount?"Hidden":x.statistics?.subscriberCount??"Not available",engagement_rate:"Not available",country:x.snippet?.country||null,thumbnail_url:x.snippet?.thumbnails?.medium?.url||null});
     }
    }
    nextPage=body.nextPageToken;pages++;if(!nextPage)break;
   }
  }catch(e){notices.push("youtube: "+String(e instanceof Error?e.message:e).slice(0,180));}
 }

 const unique=new Map<string,any>();for(const c of [...youtubeCreators,...apifyCreators])unique.set(c.profile_url,c);
 const groups=[...new Set<string>(platforms)].map(p=>[...unique.values()].filter(c=>c.platform===p));
 const balanced:any[]=[];for(let i=0;balanced.length<requested&&groups.some(g=>g[i]);i++){for(const group of groups){if(group[i]&&balanced.length<requested)balanced.push(group[i])}}
 return respond({influencers:balanced,pending_runs:pending,notice:notices.join("; ")||undefined,provider:"youtube_and_apify",requested_count:requested});
 }catch(e){return respond({error:"Discovery failed",details:String(e instanceof Error?e.message:e)},500)}
});
