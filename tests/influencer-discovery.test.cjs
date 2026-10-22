const {readFileSync}=require('node:fs'),{stripTypeScriptTypes}=require('node:module'),vm=require('node:vm'),assert=require('node:assert/strict');
const raw=readFileSync('supabase/functions/influencer-discovery/index.ts','utf8').replace(/^import .*;\n/,'');
const source=stripTypeScriptTypes(raw);
function backend(fetcher){let handler;const ctx=vm.createContext({URL,Response,Request,AbortSignal,console,createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'w'}})})}),fetch:fetcher,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn}});vm.runInContext(source,ctx);return async body=>{const response=await handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({workspace_id:'w',keyword:'travel',result_count:5,platforms:['youtube','instagram'],...body})}));return response.json()}}
const json=x=>new Response(JSON.stringify(x));
const ig=(username,extra={})=>({username,fullName:username,followersCount:'2000',url:'https://www.instagram.com/'+username+'/',...extra});
const yt=(id,count=2000)=>({id,snippet:{title:id,country:'IN'},statistics:{subscriberCount:String(count)}});
(async()=>{
let starts=0,searches=0,actorInput;
const run=backend(async(url,init)=>{
 const u=new URL(url);
 if(u.pathname.includes('/acts/')){starts++;actorInput=JSON.parse(init.body);return json({data:{id:'abcdefgh'}})}
 if(u.pathname.includes('/actor-runs/'))return json({data:{status:'SUCCEEDED',defaultDatasetId:'dataset'}});
 if(u.pathname.includes('/datasets/'))return json([ig('one'),ig('two'),ig('three'),ig('bad',{url:'https://instagram.com.evil.test/profile'})]);
 if(u.pathname.endsWith('/search')){searches++;return json({items:[{id:{channelId:'y'+searches}}],nextPageToken:searches===1?'next':undefined})}
 if(u.pathname.endsWith('/channels'))return json({items:searches===1?[yt('y1',10)]:[yt('y2'),yt('y3'),yt('y4')]});
 throw Error('Unexpected '+url);
});
let data=await run({follower_range:'1000'});
assert.equal(data.influencers.length,5);assert.equal(data.influencers[1].platform,'instagram');assert.equal(data.influencers[1].followers,2000);assert(!data.influencers.some(x=>x.name==='bad'));assert.equal(searches,2,'pagination continues after follower filtering');assert.equal(actorInput.resultsType,'details');assert.equal(actorInput.searchLimit,25);assert.equal(actorInput.resultsLimit,1);
starts=0;searches=0;
data=await run({runs:[{platform:'instagram',id:'abcdefgh'}],platforms:['youtube','instagram','linkedin']});
assert.equal(starts,0,'poll must never start new collections');assert.equal(searches,0,'poll must not repeat YouTube quota usage');assert.equal(data.influencers.length,3);assert(data.influencers.every(x=>x.platform==='instagram'));
const failed=backend(async url=>{url=String(url);if(url.includes('/acts/'))throw Error('Provider down');if(url.includes('/search'))return json({items:[{id:{channelId:'yt'}}]});return json({items:[yt('yt')]})});
data=await failed({});assert.equal(data.influencers[0].platform,'youtube');assert.match(data.notice,/instagram.*Provider down/);
const pending=backend(async url=>url.includes('/acts/')?json({data:{id:'abcdefgh'}}):json({data:{status:'RUNNING'}}));
data=await pending({platforms:['instagram']});assert.equal(data.pending_runs.length,1);assert.equal(data.influencers.length,0);
const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}}});return elements.get(id)};
el('infKeyword').value='travel';el('infResultCount').value='5';el('infMinFollowers').value='0';
let calls=0;
const ctx=vm.createContext({console,URL,Set,Map,Number,setTimeout:fn=>fn(),document:{getElementById:el,querySelectorAll:()=>[{value:'youtube'},{value:'instagram'}]},workspace:{id:'w'},esc:String,sb:{functions:{invoke:async(name,{body})=>{calls++;if(calls===1){assert.equal(body.runs,null);return {data:{influencers:Array.from({length:5},(_,i)=>({name:'YT'+i,platform:'youtube',profile_url:'https://youtube.com/'+i})),pending_runs:[{platform:'instagram',id:'abcdefgh'}]}}}assert.equal(body.runs[0].id,'abcdefgh');return {data:{influencers:Array.from({length:5},(_,i)=>({name:'IG'+i,platform:'instagram',profile_url:'https://instagram.com/'+i})),pending_runs:[]}}}}}});
vm.runInContext(readFileSync('influencer-intelligence.js','utf8'),ctx);await vm.runInContext('discoverInfluencers()',ctx);
assert.equal(calls,2);assert.equal(vm.runInContext('influencerCurrentResults.length',ctx),5);assert.equal(vm.runInContext("influencerCurrentResults.filter(x=>x.platform==='instagram').length",ctx),2);assert.match(el('infMessage').textContent,/youtube: 3 · instagram: 2/);
// Slow runs can be resumed, without starting a fresh collector.
let slowCalls=0;
ctx.sb.functions.invoke=async(name,{body})=>{slowCalls++;return {data:{influencers:[],pending_runs:[{platform:'instagram',id:'abcdefgh'}]}}};
await vm.runInContext('discoverInfluencers()',ctx);assert.equal(slowCalls,40);assert.match(el('infMessage').textContent,/Collection is still running/);
ctx.sb.functions.invoke=async(name,{body})=>{assert.equal(body.runs[0].id,'abcdefgh');return {data:{influencers:[{name:'Late IG',platform:'instagram',profile_url:'https://instagram.com/late'}],pending_runs:[]}}};
await el('infContinueSearch').onclick();assert.equal(vm.runInContext('influencerCurrentResults[0].name',ctx),'Late IG');
// A later provider failure preserves the already verified results.
let partialCalls=0;
ctx.sb.functions.invoke=async()=>++partialCalls===1?{data:{influencers:[{name:'YT',platform:'youtube',profile_url:'https://youtube.com/one'}],pending_runs:[{platform:'instagram',id:'abcdefgh'}]}}:{error:{message:'Temporary outage'}};
await vm.runInContext('discoverInfluencers()',ctx);assert.equal(vm.runInContext('influencerCurrentResults.length',ctx),1);assert.match(el('infMessage').textContent,/Temporary outage/);
console.log('PASS Instagram URLs and numeric followers, actor profile input, post-filter YouTube pagination, fair platform allocation, no restarted collectors/repeated YouTube polls, partial provider failure, pending collections and combined UI results');
})().catch(e=>{console.error(e);process.exitCode=1});
