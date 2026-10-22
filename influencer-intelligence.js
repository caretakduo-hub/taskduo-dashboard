let influencerCurrentResults=[],influencerCurrentFilters=null;
let influencerSearchGeneration=0;
function resetInfluencerSearch(){influencerSearchGeneration++;influencerCurrentResults=[];influencerCurrentFilters=null;document.getElementById('infKeyword').value='';document.getElementById('infNiche').value='';document.getElementById('infCountry').value='';document.getElementById('infMinFollowers').value='0';document.getElementById('infSimilar').value='';document.getElementById('infResultCount').value='20';document.querySelectorAll('.infPlatform').forEach(x=>x.checked=true);const msg=document.getElementById('infMessage');msg.textContent='';msg.classList.add('hidden');document.getElementById('infResults').innerHTML='<div class="card"><p class="muted">Enter search criteria to begin a new search.</p></div>';document.getElementById('infSavePanel')?.classList.add('hidden');document.getElementById('infKeyword').focus()}
/* Influencer Intelligence: use only real provider results, never fabricate creator data. */
function infBalancedResults(creators,platforms,limit){
 const unique=[...new Map(creators.map(c=>[c.profile_url,c])).values()];
 const groups=platforms.map(p=>unique.filter(c=>c.platform===p)),out=[];
 for(let i=0;out.length<limit&&groups.some(g=>g[i]);i++)for(const group of groups)if(group[i]&&out.length<limit)out.push(group[i]);
 return out;
}
async function discoverInfluencers(continuation=null){
 const requestGeneration=++influencerSearchGeneration;
 const filters=continuation?.filters||{
  keyword:document.getElementById('infKeyword').value.trim(),niche:document.getElementById('infNiche').value,
  country:document.getElementById('infCountry').value,follower_range:document.getElementById('infMinFollowers').value,
  similar_url:document.getElementById('infSimilar').value.trim(),result_count:Number(document.getElementById('infResultCount').value),
  platforms:[...document.querySelectorAll('.infPlatform:checked')].map(x=>x.value),workspace_id:workspace.id
 };
 const {keyword,niche,country,similar_url:similar,result_count,platforms}=filters;
 const msg=document.getElementById('infMessage'),results=document.getElementById('infResults');
 msg.classList.remove('hidden');
 if((!keyword&&!niche&&!similar)||!platforms.length){msg.textContent='Enter a topic or similar profile and choose at least one platform.';return}
 if(!Number.isInteger(result_count)||result_count<1||result_count>100){msg.textContent='Choose 1 to 100 total profiles.';return}
 if(similar){try{const u=new URL(similar);if(!['https:','http:'].includes(u.protocol))throw Error('invalid')}catch{msg.textContent='Enter a valid public profile URL.';return}}
 if(similar&&!keyword&&!niche){msg.textContent='Similar-account discovery is not currently supported. Add a keyword or niche to search for creators instead.';return}
 influencerCurrentResults=[];influencerCurrentFilters=null;document.getElementById('infSavePanel')?.classList.add('hidden');
 msg.textContent='Searching selected platforms…';results.innerHTML='<div class="card"><p class="muted">Collecting public creator profiles. Instagram and LinkedIn collections may take a few minutes…</p></div>';
 let runs=continuation?.runs||null,allCreators=continuation?.creators||[],notices=new Set(continuation?.notices||[]),failure='';
 try{
  for(let attempt=0;attempt<40;attempt++){
   if(requestGeneration!==influencerSearchGeneration)return;
   const response=await sb.functions.invoke('influencer-discovery',{body:{...filters,runs}});
   if(requestGeneration!==influencerSearchGeneration)return;
   if(response.error){let detail=response.error.message||'Request failed';try{const payload=await response.error.context?.json();detail=payload?.details||payload?.error||detail}catch{}throw Error(detail)}
   if(response.data?.error)throw Error(response.data.details||response.data.error);
   allCreators=[...new Map([...allCreators,...(response.data?.influencers||[])].map(c=>[c.profile_url,c])).values()];
   if(response.data?.notice)notices.add(response.data.notice);
   runs=response.data?.pending_runs||[];
   const visible=infBalancedResults(allCreators,platforms,result_count);
   results.innerHTML=visible.length?infCardGrid(infProfileMarkup(visible)):'<div class="card"><p class="muted">Waiting for matching profiles…</p></div>';
   if(!runs.length)break;
   msg.textContent=visible.length+' profiles found so far. Still collecting '+runs.map(x=>x.platform).join(' and ')+'…';
   if(attempt<39)await new Promise(resolve=>setTimeout(resolve,5000));
  }
 }catch(e){if(requestGeneration!==influencerSearchGeneration)return;failure='Search could not finish: '+(e?.message||'Unexpected error')+'.';}
 if(requestGeneration!==influencerSearchGeneration)return;
 const creators=infBalancedResults(allCreators,platforms,result_count);
 influencerCurrentResults=creators;influencerCurrentFilters=filters;
 document.getElementById('infSavePanel')?.classList.toggle('hidden',!creators.length);
 if(creators.length){document.getElementById('infListTitle').value='';document.getElementById('infSaveStatus').textContent=''}
 const counts=platforms.map(p=>p+': '+creators.filter(c=>c.platform===p).length).join(' · ');
 const pending=Array.isArray(runs)&&runs.length>0;
 msg.textContent=creators.length+' of '+result_count+' requested total profiles found. '+counts+'. '
  +(pending?'Collection is still running. Continue checking to retrieve the remaining results. ':!failure&&creators.length<result_count?'Fewer matching profiles were returned within the search limit. Try a broader keyword or less restrictive filters. ':'')
  +(similar?'Results use keyword/niche; similar-account matching is not supported. ':'')+[...notices].join('; ')+(failure?' '+failure:'');
 results.innerHTML=(creators.length?infCardGrid(infProfileMarkup(creators)):'<div class="card"><p class="muted">No matching verified profiles returned. Review the platform status above.</p></div>')
  +(pending?'<button class="btn secondary" id="infContinueSearch" style="margin-top:16px">Continue checking collection</button>':'');
 const next=document.getElementById('infContinueSearch');if(pending&&next)next.onclick=()=>discoverInfluencers({filters,runs,creators:allCreators,notices:[...notices]});
}

const infColors=['#24204d','#103b45','#403019','#3e223e','#193b2c','#3e262a','#243850','#393020'];
function infProfileMarkup(creators){return creators.map((c,i)=>{let u;try{u=new URL(c.profile_url);if(!['http:','https:'].includes(u.protocol))return ''}catch{return ''}const bg=infColors[i%infColors.length];return '<article class="card" style="box-sizing:border-box;width:100%;min-width:0;min-height:190px;background:'+bg+';border:1px solid #8888aa;border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px;justify-content:space-between"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap"><div style="min-width:0;flex:1"><span class="pill">'+esc(c.platform||'Creator')+'</span><h3 style="color:white;margin:12px 0 4px;overflow-wrap:anywhere;font-size:19px">'+esc(c.name||c.handle||'Public creator')+'</h3><p style="color:#ddd;margin:0;overflow-wrap:anywhere">'+esc(c.niche||'Niche not available')+'</p></div><div style="flex-shrink:0;text-align:right"><div style="color:white;font-weight:750;font-size:23px">'+esc(c.followers??'N/A')+'</div><div style="color:#ddd;font-size:12px">followers / subscribers</div></div></div><a style="color:white;text-decoration:underline;overflow-wrap:anywhere;align-self:flex-start;margin-top:auto" href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">Open profile ↗</a></article>'}).join('')}
function infCardGrid(markup){return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:18px;align-items:stretch;width:100%">'+markup+'</div>'}
function infExportRows(list){return (Array.isArray(list.creators)?list.creators:[]).map(c=>({Name:String(c.name||c.handle||''),Platform:String(c.platform||''),Followers:c.followers??'Not available','Profile URL':/^https?:\/\//.test(String(c.profile_url||''))?String(c.profile_url):'',Niche:String(c.niche||''),'List title':list.title,'Saved at':new Date(list.created_at).toLocaleString()}))}
function infExportName(title){return String(title||'influencers').replace(/[^a-z0-9_-]+/gi,'_').slice(0,65)}
function infCsvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function infExportCsv(list){const rows=infExportRows(list),cols=['Name','Platform','Followers','Profile URL','Niche','List title','Saved at'];const csv='\uFEFF'+[cols.map(infCsvCell).join(','),...rows.map(r=>cols.map(c=>infCsvCell(r[c])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=infExportName(list.title)+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function infExportExcel(list){const rows=infExportRows(list);if(!rows.length){alert('No saved influencers in this list.');return}try{if(!window.XLSX)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});if(!window.XLSX)throw Error('Excel library unavailable');const sheet=XLSX.utils.json_to_sheet(rows);sheet['!cols']=[{wch:34},{wch:16},{wch:18},{wch:70},{wch:30},{wch:35},{wch:24}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Influencers');XLSX.writeFile(book,infExportName(list.title)+'.xlsx')}catch(e){console.warn('XLSX unavailable; using Excel-compatible CSV',e);infExportCsv(list)}}
async function infSaveList(){const title=document.getElementById('infListTitle')?.value.trim(),status=document.getElementById('infSaveStatus'),button=document.getElementById('infSaveListBtn');if(!title||title.length>120){status.textContent='Enter a list title (1–120 characters).';return}if(!influencerCurrentResults.length){status.textContent='Search for influencers before saving.';return}button.disabled=true;status.textContent='Saving list…';try{const {error}=await sb.from('influencer_saved_lists').insert({workspace_id:workspace.id,created_by:session.user.id,title,search_filters:influencerCurrentFilters||{},creators:influencerCurrentResults.slice(0,100)});if(error)throw error;status.textContent='List saved successfully. You can start another search.';await infLoadLists()}catch(e){status.textContent='Unable to save list: '+e.message}finally{button.disabled=false}}
async function infLoadLists(){const target=document.getElementById('infSavedLists');if(!target||!workspace)return;target.innerHTML='<p class="muted">Loading saved lists…</p>';const {data,error}=await sb.from('influencer_saved_lists').select('id,title,created_at,creators,search_filters').eq('workspace_id',workspace.id).order('created_at',{ascending:false}).limit(100);if(error){target.textContent='Could not load saved lists: '+error.message;return}const lists=data||[];target.innerHTML=lists.length?lists.map(x=>'<div class="card" style="margin:10px 0"><div class="toolbar"><div style="flex:1"><h3>'+esc(x.title)+'</h3><p class="muted">'+esc(new Date(x.created_at).toLocaleString())+' · '+(Array.isArray(x.creators)?x.creators.length:0)+' saved influencer(s)</p></div><button class="btn secondary" data-inf-open="'+esc(x.id)+'">Open list</button><button class="btn secondary" data-inf-export="'+esc(x.id)+'">Download Excel</button><button class="btn secondary" data-inf-delete="'+esc(x.id)+'">Delete</button></div><div id="inf-list-'+esc(x.id)+'" class="hidden" style="margin-top:18px;width:100%"></div></div>').join(''):'<p class="muted">No saved lists yet. Search for creators, enter a title and click Save list.</p>';target.querySelectorAll('[data-inf-open]').forEach(b=>b.onclick=()=>{const list=lists.find(x=>x.id===b.dataset.infOpen),panel=document.getElementById('inf-list-'+b.dataset.infOpen);if(!list||!panel)return;const wasHidden=panel.classList.contains('hidden');target.querySelectorAll('[id^="inf-list-"]').forEach(p=>p.classList.add('hidden'));if(wasHidden){panel.innerHTML=infCardGrid(infProfileMarkup(Array.isArray(list.creators)?list.creators:[]));panel.classList.remove('hidden')}});target.querySelectorAll('[data-inf-export]').forEach(b=>b.onclick=()=>{const list=lists.find(x=>x.id===b.dataset.infExport);if(list)infExportExcel(list)});target.querySelectorAll('[data-inf-delete]').forEach(b=>b.onclick=async()=>{const list=lists.find(x=>x.id===b.dataset.infDelete);if(!list||!confirm('Delete saved list "'+list.title+'"?'))return;const {error}=await sb.from('influencer_saved_lists').delete().eq('id',list.id).eq('workspace_id',workspace.id);if(error)alert('Could not delete list: '+error.message);else await infLoadLists()})}
function infSetupLists(){const save=document.getElementById('infSaveListBtn'),reload=document.getElementById('infReloadLists');if(save)save.onclick=infSaveList;if(reload)reload.onclick=infLoadLists;infLoadLists()}
