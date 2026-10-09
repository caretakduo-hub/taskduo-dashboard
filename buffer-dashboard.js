/* Buffer channel verification; posting is disabled until media workflow is validated. */
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('bufferSyncBtn'),status=document.getElementById('bufferSyncStatus'),list=document.getElementById('bufferChannelList');
 if(!button)return;
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Checking Buffer channels…';list.textContent='';
  try{
   const {data:{session:active}}=await sb.auth.getSession();
   if(!active)throw new Error('Sign in to TaskDuo first');
   const response=await fetch(U+'/functions/v1/buffer-integration',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+active.access_token,'apikey':K},body:JSON.stringify({action:'channels'})});
   const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||'Buffer connection failed');
   const instagram=(result.channels||[]).filter(x=>String(x.service).toLowerCase()==='instagram');
   const match=instagram.filter(x=>String(x.name||'').replace(/^@/,'').toLowerCase()==='taskduo');
   status.textContent=match.length?'Instagram @taskduo found in Buffer. Channel verified; publishing setup pending.':instagram.length?'Instagram channels found, but @taskduo was not an exact name match. Confirm the channel before posting.':'No Instagram channel returned by Buffer. Check your Buffer account and API permissions.';
   list.replaceChildren();
   for(const c of instagram){const div=document.createElement('div');div.className='notice';div.textContent='Instagram channel: '+c.name+' — '+(match.includes(c)?'@taskduo matched':'Needs confirmation');list.appendChild(div)}
  }catch(e){status.textContent='Unable to verify Buffer connection: '+e.message}
  finally{button.disabled=false}
 });
});