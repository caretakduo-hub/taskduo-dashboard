const {readFileSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',innerHTML:'',value:'',querySelectorAll:()=>[]});return elements.get(id)};
let fail=false,release,checks=[],reads=[];
const ctx=vm.createContext({console,Date,Set,Map,workspace:{id:'w'},sources:[],contentItems:[],esc:String,document:{getElementById:el},workspaceRows:async table=>{reads.push(table);if(fail)throw Error('Permission denied');if(release)await new Promise(r=>release=r);return table==='comp_sources'?[{id:'s',name:'Example',platform:'website',status:'collecting'}]:[{source_id:'s',title:'Automation',content_type:'Article'}]},collectorCall:async(name,id)=>{checks.push([name,id]);return {status:'ready'}}});
vm.runInContext(readFileSync('content-intelligence.js','utf8'),ctx);
(async()=>{
vm.runInContext('ciSetup()',ctx);assert.equal(typeof el('ciRefresh').onclick,'function');
await el('ciRefresh').onclick();assert.match(el('ciRefreshStatus').textContent,/Analyzed 1 collected items from 1 sources/);assert.equal(checks[0][0],'apify-sync');assert(!reads.includes('social_posts'));assert.match(el('ciResults').innerHTML,/Automation/);assert.equal(el('ciRefresh').disabled,false);
fail=true;await el('ciRefresh').onclick();assert.match(el('ciRefreshStatus').textContent,/Refresh failed: Permission denied/);assert.equal(el('ciRefresh').disabled,false);assert.equal(ctx.contentItems.length,1,'failed refresh retains prior data');fail=false;
ctx.collectorCall=async()=>{throw Error('Collector unavailable')};await el('ciRefresh').onclick();assert.match(el('ciRefreshStatus').textContent,/Collection checks failed: Example: Collector unavailable/);assert.match(el('ciRefreshStatus').textContent,/Analyzed 1/);
release=true;const first=el('ciRefresh').onclick();assert.equal(el('ciRefresh').disabled,true);const count=reads.length;await el('ciRefresh').onclick();assert.equal(reads.length,count,'duplicate refresh ignored');const finish=release;release=null;finish();await first;assert.equal(el('ciRefresh').disabled,false);
console.log('PASS refresh click, collection sync, focused data reload, rendering, errors, preserved data, partial failure and duplicate-click guard');
})().catch(e=>{console.error(e);process.exitCode=1});
