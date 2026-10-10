const assert=require('node:assert/strict');
(async()=>{
 const {videoOptions,queueURL,mediaURL,handleVideo,VIDEO_MODEL}=await import('../supabase/functions/ai-generate/fal-video.ts');
 const id='11111111-1111-4111-8111-111111111111',user='user-1',workspace='workspace-1';
 const valid={action:'video_submit',job_id:id,workspace_id:workspace,platform:'instagram',format:'reel',prompt:'A studio product shot with gentle movement.',duration:'5',resolution:'720p',aspect_ratio:'9:16'};
 assert.equal(videoOptions(valid).duration,'5');assert.throws(()=>videoOptions({...valid,aspect_ratio:'16:9'}));assert.throws(()=>videoOptions({...valid,prompt:'x'.repeat(1501)}));assert.throws(()=>videoOptions({...valid,format:'image'}));
 assert.throws(()=>queueURL('https://evil.example/requests/req-12345/status','req-12345'));assert.throws(()=>mediaURL('http://169.254.169.254/latest/meta-data'));assert.throws(()=>mediaURL('https://127.0.0.1/video.mp4'));
 const rows=new Map();let calls=0,uploads=0,providerState='IN_QUEUE';
 class Query{
  constructor(){this.filters=[];this.op='read'}select(){return this}eq(key,value){this.filters.push(r=>r[key]===value);return this}in(key,values){this.filters.push(r=>values.includes(r[key]));return this}update(patch){this.op='update';this.patch=patch;return this}async maybeSingle(){return {data:[...rows.values()].find(r=>this.filters.every(f=>f(r)))||null}}
  async insert(row){rows.set(row.id,{...row});return {error:null}}then(resolve,reject){try{if(this.op==='update')for(const row of rows.values())if(this.filters.every(f=>f(row)))Object.assign(row,this.patch);return Promise.resolve({error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}
 }
 const admin={
 from(){return new Query()},
 rpc:async()=>({data:true}),
 storage:{from(){return {
 upload:async(path,bytes)=>{assert.equal(path,user+'/fal-'+id+'.mp4');assert(bytes.length>0);uploads++;return {error:null}},
 createSignedUrl:async(path)=>({data:{signedUrl:'https://example.test/private/'+path}})
 }}}
 };
 const original=global.fetch;global.fetch=async(url,options)=>{calls++;if(url==='https://queue.fal.run/'+VIDEO_MODEL){assert.equal(options.headers.Authorization,'Key fake-test-key');return Response.json({request_id:'req-12345',status_url:'https://queue.fal.run/fal-ai/wan-25-preview/requests/req-12345/status',response_url:'https://queue.fal.run/fal-ai/wan-25-preview/requests/req-12345'})}if(url.endsWith('/status'))return Response.json({status:providerState});if(url.endsWith('/requests/req-12345'))return Response.json({video:{url:'https://v3.fal.media/test/video.mp4'}});if(url==='https://v3.fal.media/test/video.mp4')return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'video/mp4'}});throw Error('Unexpected network request: '+url)};
 const reply=(data,status=200)=>Response.json(data,{status});
 try{
 let r=await handleVideo(valid,admin,user,undefined,reply);assert.equal(r.status,503);assert.equal(calls,0);
 r=await handleVideo({...valid,prompt:''},admin,user,'fake-test-key',reply);assert.equal(r.status,400);assert.equal(calls,0);
 r=await handleVideo(valid,admin,user,'fake-test-key',reply);assert.equal((await r.json()).status,'queued');assert.equal(calls,1);
 await handleVideo(valid,admin,user,'fake-test-key',reply);assert.equal(calls,1,'same job must not submit a second paid request');
 r=await handleVideo({...valid,action:'video_status'},admin,'other-user','fake-test-key',reply);assert.equal(r.status,404);assert.equal(calls,1,'another user must not access a job');
 providerState='IN_PROGRESS';r=await handleVideo({...valid,action:'video_status'},admin,user,'fake-test-key',reply);assert.equal((await r.json()).status,'running');
 providerState='COMPLETED';r=await handleVideo({...valid,action:'video_status'},admin,user,'fake-test-key',reply);const ready=await r.json();assert.equal(ready.status,'completed');assert.equal(ready.asset.type,'video');assert.equal(uploads,1);
 const before=calls;await handleVideo({...valid,action:'video_status'},admin,user,'fake-test-key',reply);assert.equal(calls,before,'completed status uses saved media without another provider call');
 console.log('PASS video validation, missing key, idempotency, user isolation, queue lifecycle and private media persistence');
 }finally{global.fetch=original}
})().catch(e=>{console.error(e);process.exitCode=1});
