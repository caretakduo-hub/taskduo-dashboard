import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const send=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,"Content-Type":"application/json"}});
const sections=["overview","comp","contentintel","influencers","postingintel","quality","ads","socialmanage","posting","approval","calendar","traffic","settings"];
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response(null,{headers:cors});if(req.method!=="POST")return send({error:"Method not allowed"},405);
try{
 const jwt=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");if(!jwt)return send({error:"Authentication required"},401);
 const {data:{user},error:authError}=await admin.auth.getUser(jwt);if(authError||!user)return send({error:"Invalid session"},401);
 const body=await req.json(),action=String(body.action||""),workspaceId=String(body.workspace_id||"");
 if(action==="change_password"){
  const oldPassword=String(body.current_password||""),newPassword=String(body.new_password||"");
  if(newPassword.length<12||newPassword.length>128)return send({error:"New password must be 12–128 characters"},400);
  if(!user.phone)return send({error:"Phone account required"},400);
  const verify=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:verifyError}=await verify.auth.signInWithPassword({phone:user.phone,password:oldPassword});
  if(verifyError)return send({error:"Current password is incorrect"},403);
  const {error:changeError}=await admin.auth.admin.updateUserById(user.id,{password:newPassword});
  if(changeError)throw changeError;
  const {error:flagError}=await admin.from("workspace_access").update({must_change_password:false}).eq("user_id",user.id).eq("active",true);
  if(flagError)throw flagError;
  return send({ok:true});
 }
 if(!/^[0-9a-f-]{36}$/i.test(workspaceId))return send({error:"Valid workspace required"},400);
 const {data:owner,error:ownerError}=await admin.from("workspaces").select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
 if(ownerError||!owner)return send({error:"Only the workspace owner can manage accounts"},403);
 if(action==="list"){
  const {data,error}=await admin.from("workspace_access").select("user_id,role,sections,active,must_change_password,created_at").eq("workspace_id",workspaceId).order("created_at",{ascending:false});
  if(error)throw error;
  const users=[];for(const row of data||[]){const {data:profile}=await admin.auth.admin.getUserById(row.user_id);users.push({...row,phone:profile?.user?.phone||""})}
  return send({users});
 }
 if(action==="create"){
  const phone=String(body.phone||"").trim(),password=String(body.password||""),role=String(body.role||"view"),grants=Array.isArray(body.sections)?body.sections.filter((s:unknown)=>typeof s==="string"&&sections.includes(s)):null;
  if(!/^\+[1-9]\d{7,14}$/.test(phone))return send({error:"Use an international phone number such as +919876543210"},400);
  if(password.length<12||password.length>128)return send({error:"Temporary password must be 12–128 characters"},400);
  if(!["admin","view"].includes(role)||!grants?.length)return send({error:"Choose a role and at least one section"},400);
  const {data:created,error:createError}=await admin.auth.admin.createUser({phone,password,phone_confirm:true});
  if(createError)return send({error:createError.message},400);
  const {error:membershipError}=await admin.from("workspace_access").insert({workspace_id:workspaceId,user_id:created.user.id,role,sections:grants,active:true,must_change_password:true});
  if(membershipError){await admin.auth.admin.deleteUser(created.user.id);throw membershipError}
  return send({ok:true});
 }
 if(action==="update"){
  const target=String(body.user_id||"");if(target===user.id)return send({error:"Cannot edit owner"},400);
  const changes:{role?:string;sections?:string[];active?:boolean}={};
  if(body.role!==undefined){if(!["admin","view"].includes(body.role))return send({error:"Invalid role"},400);changes.role=body.role}
  if(body.sections!==undefined){if(!Array.isArray(body.sections)||body.sections.some((s:unknown)=>!sections.includes(String(s))))return send({error:"Invalid sections"},400);changes.sections=body.sections}
  if(typeof body.active==="boolean")changes.active=body.active;
  const {data,error}=await admin.from("workspace_access").update(changes).eq("workspace_id",workspaceId).eq("user_id",target).select("user_id").maybeSingle();
  if(error)throw error;if(!data)return send({error:"Member not found"},404);return send({ok:true});
 }
 if(action==="reset_password"){
  const target=String(body.user_id||""),password=String(body.password||"");if(password.length<12||password.length>128)return send({error:"Temporary password must be 12–128 characters"},400);
  const {data:member}=await admin.from("workspace_access").select("user_id").eq("workspace_id",workspaceId).eq("user_id",target).maybeSingle();if(!member)return send({error:"Member not found"},404);
  const {error:resetError}=await admin.auth.admin.updateUserById(target,{password});if(resetError)throw resetError;
  const {error:flagError}=await admin.from("workspace_access").update({must_change_password:true}).eq("workspace_id",workspaceId).eq("user_id",target);if(flagError)throw flagError;
  return send({ok:true});
 }
 return send({error:"Unknown action"},400);
}catch(e){console.error("access-management",e);return send({error:"Request failed. Check server logs."},500)}
});
