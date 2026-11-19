import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {checkedRoute,dispatch,operation,selection,relayPrice,priceApproval,ids,endpoint,tools,bodies,title} from './candidate-live-guards.mjs'
import {sha} from './candidate-live-guards.mjs'
import {reread,statusUsage} from './candidate-live-capture.mjs'
import {mkdtempSync,readdirSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {projection} from './candidate-live-native.mjs'
import {exportProof,publishProof} from './candidate-live-proof.mjs'
const r={provider:'synthetic',model:'deepseek-test/route-a',endpoint:'https://tokease.cn/v1'},q={...r,reviewed_at:new Date().toISOString(),currency:'USD_PER_MILLION_TOKENS',input:2,output:5}
const dir={provider:r.provider,settingsNs:'llm-pi-ai',settingsPath:['providers',r.provider]},profile={apiKeyEnv:'SYNTHETIC_REF',baseURL:r.endpoint},policy={mode:'normal',maxRetries:0},id=randomUUID()
const models=[{id:r.model}],args=[r,models,dir,profile,true,policy]
test('native projection uses selected route, redacted settings and presence only',async()=>{
  const ctx={agentDefaultModel:{currentSelection:()=>r},llm:{listConfigurableProviders:()=>[dir],listProviders:()=>[{id:r.provider}],listModels:()=>models,providerRetryPolicy:()=>policy},credentials:{describe:async ref=>({configured:ref===profile.apiKeyEnv}),resolve:()=>assert.fail()},settings:{describe:opts=>{assert.deepEqual(opts,{redactSecrets:true});return [{ns:dir.settingsNs,value:{providers:{synthetic:profile}}}]}}}
  assert.deepEqual(await projection(ctx),r);ctx.llm.listConfigurableProviders=()=>[dir,dir];await assert.rejects(projection(ctx))
})
test('rejects absent credential/catalog, non-native adapter, inline auth, retry and route substitution',()=>{
  for(const [index,value] of [[1,[]],[2,{...dir,settingsNs:'other'}],[3,{...profile,apiKey:'not-a-key'}],[3,{...profile,headers:{extra:'fixture'}}],[4,false],[5,{mode:'always',maxRetries:0}],[5,{mode:'normal',maxRetries:1}]]){const a=args.slice();a[index]=value;assert.throws(()=>checkedRoute(...a))}
  for(const model of ['gpt-test','deepseek-fixture','deepseek-x?token'])assert.throws(()=>ids({...r,model}))
  for(const v of ['http://tokease.cn','https://tokease.cn:9443','https://name@tokease.cn','https://tokease.cn/v1?key=x','https://other.invalid/v1'])assert.throws(()=>endpoint(v))
})
test('price rejects future/stale approvals, mismatch, negative and ambiguous/scheduled prices',()=>{
  priceApproval(q,r);for(const diff of [{reviewed_at:'bad'},{reviewed_at:'2000-01-01'},{reviewed_at:'2099-01-01'},{model:'deepseek-other'},{input:Infinity},{output:0}])assert.throws(()=>priceApproval({...q,...diff},r))
  const c={route_slug:'route-a',model_ratio:1,completion_ratio:2,quota_type:0},p={data:[{model_name:'deepseek-test',enable_groups:['default'],channel_list:[c]}],group_ratio:{default:1}},s={data:{quota_per_unit:1e6}}
  relayPrice(r.model,p,s,q);assert.throws(()=>relayPrice('deepseek-test/other',p,s,q));p.data[0].channel_list.push(c);assert.throws(()=>relayPrice(r.model,p,s,q));p.data[0].channel_list.pop();c.time_pricing={regular_pricing:c,schedules:[{pricing:{...c,completion_ratio:10}}]};assert.throws(()=>relayPrice(r.model,p,s,q))
})
test('native transport requires an unused permit on exact endpoint; no third attempt',()=>{
  const req={...r,baseURL:r.endpoint},permits=new Set(),consume=i=>assert(permits.delete(i));assert.throws(()=>dispatch(req,r,q,1,consume));permits.add(1)
  for(const extra of [{baseURL:'https://api.deepseek.com'},{sessionId:'test'},{model:'deepseek-other'}])assert.throws(()=>dispatch({...req,...extra},r,q,1,consume))
  dispatch(req,r,q,1,consume);assert.throws(()=>dispatch(req,r,q,1,consume));permits.add(2);dispatch(req,r,q,2,consume);permits.add(3);assert.throws(()=>dispatch(req,r,q,3,consume))
})
test('rejects wrong update tool, unexpected title, stale revision and wrong target',()=>{
  const p={...r,tool:tools[1],arguments:{object_id:id,body:bodies[1],expected_revision:1}};selection(p,r,1,id)
  for(const change of [{tool:tools[0]},{provider:'other'},{arguments:{...p.arguments,title:'extra'}},{arguments:{...p.arguments,expected_revision:2}},{arguments:{...p.arguments,object_id:randomUUID()}}])assert.throws(()=>selection({...p,...change},r,1,id))
})
function fixture(i){const revision=i+1,o={id,title,body:bodies[i],revision},ui={selected:id,target:id,attr:String(revision),input:String(revision),label:title+' · revision '+revision,detail:o};return [i,id,{code:i?'UPDATED':'READ',object:o},o,o,ui,i]}
test('UI, independent HTTP and SQL must agree for both operations including selector and receipt',()=>{
  for(let i=0;i<2;i++) {const a=fixture(i);assert.equal(operation(...a).revision,i+1);for(const [k,v] of [[3,{...a[3],id:randomUUID()}],[4,{...a[4],body:'wrong'}],[5,{...a[5],label:'stale'}],[5,{...a[5],attr:'stale'}],[6,9]]){const b=a.slice();b[k]=v;assert.throws(()=>operation(...b))}}
})
const usage=attempts=>({attempts,reported_input_tokens:attempts*7,reported_output_tokens:attempts*3,unknown_cost_calls:attempts,known_estimated_usd:0,budget_warning:false})
const observed=i=>({http_revision:i+1,http_response_sha256:'9'.repeat(64),http_body_sha256:sha(bodies[i]),usage_before:usage(i),usage_after:usage(i+1),screenshot_sha256:'7'.repeat(64)})
test('hashes exact GET entity bytes separately from UTF-8 content; usage preserves unknown cost',()=>{
  const a=reread(Buffer.from('{"data":{"body":"a","revision":2}}')),b=reread(Buffer.from('{"data": {"body":"a","revision":2}}'))
  assert.notEqual(a.http_response_sha256,b.http_response_sha256);assert.equal(a.http_body_sha256,b.http_body_sha256);assert.equal(a.http_revision,2);assert.equal(statusUsage(usage(1),1).unknown_cost_calls,1)
  assert.throws(()=>statusUsage({...usage(1),reported_input_tokens:-1},1))
})
test('only reviewed fields exported; PASS cannot be inferred from two prepares',()=>{
  const time=new Date().toISOString(),p={candidate_sha:'1'.repeat(40),tree:'2'.repeat(40),upstream:'3'.repeat(40),entry_sha256:'4'.repeat(64),loader_sha256:'4'.repeat(64),runtime_sha256:'5'.repeat(64),price_approval_sha256:'6'.repeat(64),phase:'COMPLETE',status:'PASS',started_at:time,finished_at:time,host_pid:12,...r,prepare_requests:2,native_dispatches:2,successful_model_selections:2,operations:[0,1].map(i=>({...operation(...fixture(i)),...observed(i),debug:'NO_EXPORT'})),independent:true,raw:'NO_EXPORT'}
  const out=exportProof(p);assert.equal(out.unit_id,'FND-005');assert(!('independent' in out));assert(!JSON.stringify(out).includes('NO_EXPORT'));assert.throws(()=>exportProof({...p,native_dispatches:1}));assert.throws(()=>exportProof({...p,operations:[]}))
  assert.throws(()=>exportProof({...p,loader_sha256:'0'.repeat(64)}));assert.throws(()=>exportProof({...p,operations:[{...p.operations[0],http_revision:2}]}));assert.throws(()=>exportProof({...p,operations:[{...p.operations[0],screenshot_sha256:null}]}))
  const images=[Buffer.from('synthetic revision 1'),Buffer.from('synthetic revision 2')];const ready={...p,operations:p.operations.map((op,i)=>({...op,screenshot_sha256:sha(images[i])}))};const scratch=mkdtempSync(join(tmpdir(),'ko-proof-fixture-'));const path=publishProof(scratch,ready,images)
  assert.deepEqual(readdirSync(join(scratch,'export')).sort(),['proof.json','revision-1.png','revision-2.png']);const published=JSON.parse(readFileSync(path));for(const op of published.operations)assert.equal(sha(readFileSync(join(scratch,'export',op.screenshot))),op.screenshot_sha256)
})
test('missing opt-in refuses before binding, scratch, Host or network',()=>{
 const cli=fileURLToPath(new URL('candidate-live.mjs',import.meta.url));for(const args of [['live'],['live','bad','.','bad','bad','bad','--wrong']]){const run=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(run.status,1);assert.equal(run.stdout,'')}
})
