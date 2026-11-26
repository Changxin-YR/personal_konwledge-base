/** Windows operator entry. No arguments or --help are offline. */
import assert from 'node:assert/strict'
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {binding} from './candidate-live-binding.mjs'
import {publishProof} from './candidate-live-proof.mjs'
import {init,workspace,withHost} from './candidate-live-host.mjs'
import {endpoint,ids,priceApproval,relayPrice,sha} from './candidate-live-guards.mjs'
const help = [
 'freeze COMMIT CACHE  (offline; print binding fingerprint)',
 'init  (create an ACL-private disposable home; returns id and home)',
 'Provision only that DSH_HOME, stock web profile, using native DSH settings and credential manager; no copied profiles, inline keys, plugins or concurrent Host. Set its intended default and normal retry policy with maxRetries=0. Stop setup Host.',
 'For the exact Tokease test route, explicitly set KO_ACCEPT_TOKEASE_ENV=1 and supply KOS_TOKEASE_ACCEPTANCE_KEY through the launch environment only.',
 'discover COMMIT CACHE FINGERPRINT ID  (start isolated Host; no prepare or inference; emits selected route only)',
 'Review a fresh supplier price for that exact route. Put non-secret approval.json in the ID directory (parent of home), UTF-8 JSON:',
 '{"provider":"<discovered>","model":"<discovered>","endpoint":"<discovered>","currency":"USD_PER_MILLION_TOKENS","input":1,"output":1,"reviewed_at":"<UTC ISO time>"}',
 'Numbers above are placeholders, NOT prices. For tokease.cn, default billing group only: add "billing_group":"default"; harness checks exact channel tariffs including scheduled rates. For api.deepseek.com add "pricing_page_sha256":"<SHA256 of exact reviewed supplier page bytes>"; operator must verify those USD caps cover this model and all applicable rates on that page. HTTPS GET without credentials, no redirects. Other price sources BLOCK.',
 'live COMMIT CACHE FINGERPRINT ID APPROVAL_SHA256 --allow-two-prepares  (once per ID; may incur charges)',
 'Only live/export is for export: proof.json and one verified synthetic AI-panel PNG per completed reread. Never export the browser profile, database, logs or other scratch files.',
].join('\n')
async function price(q,r) {
  priceApproval(q,r)
  const get=async url=>{const res=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(12000)});assert(res.ok);const chunks=[];let n=0;for await(const chunk of res.body){n+=chunk.length;assert(n<=12*1024*1024);chunks.push(chunk)}return Buffer.concat(chunks)}
  if(new URL(r.endpoint).hostname==='tokease.cn') {
    assert.equal(q.billing_group,'default'); const [pricing,status]=await Promise.all(['pricing','status'].map(async k=>JSON.parse(await get('https://tokease.cn/api/'+k))))
    relayPrice(r.model,pricing,status,q)
  } else {assert.equal(new URL(r.endpoint).hostname,'api.deepseek.com');assert.match(q.pricing_page_sha256,/^[a-f0-9]{64}$/);assert.equal(sha(await get('https://api-docs.deepseek.com/quick_start/pricing')),q.pricing_page_sha256)}
}
async function main([mode,...a]) {
  if(!mode||mode==='--help'){console.log(help);return}
  if(mode==='init'){assert.equal(a.length,0);console.log(JSON.stringify(init()));return}
  assert(['freeze','discover','live'].includes(mode));assert.equal(a.length,{freeze:2,discover:4,live:6}[mode]);const [commit,cache,fingerprint,id,qhash,opt]=a
  if(mode==='live'){assert.equal(opt,'--allow-two-prepares');assert.match(qhash,/^[a-f0-9]{64}$/)}
  const bound=binding(commit,cache);if(mode==='freeze'){console.log(JSON.stringify({...bound.facts,fingerprint:bound.fingerprint}));return}
  assert.equal(bound.fingerprint,fingerprint);const dir=workspace(id),run=join(dir,mode);mkdirSync(run) // exclusive; no replay on failure
  const proof={unit_id:'FND-005',category:'REAL_DEEPSEEK_UI_HTTP_SQLITE',...bound.facts,status:'BLOCKED',provider:null,model:null,prepare_requests:0,successful_model_selections:0,operations:[],started_at:new Date().toISOString(),phase:'STARTUP'}
  const images=[];let q;try {
    if(mode==='live'){const path=join(dir,'approval.json');assert(lstatSync(path).isFile() && lstatSync(path).size<=4096);const bytes=readFileSync(path);assert.equal(sha(bytes),qhash);q=JSON.parse(bytes);proof.price_approval_sha256=qhash}
    await withHost(bound,dir,run,mode,async ({route,entry,base,pid,loadedHash,confined})=>{
      const r={...ids(route),endpoint:endpoint(route.endpoint)};proof.provider=r.provider;proof.model=r.model;proof.host_pid=pid;proof.loader_sha256=loadedHash
      if(mode==='discover'){console.log(JSON.stringify(r));return}
      proof.phase='PRICE_AND_ROUTE';await price(q,r);const approved={...ids(q),endpoint:r.endpoint,reviewed_at:q.reviewed_at,currency:q.currency,input:q.input,output:q.output};writeFileSync(join(run,'approved.json'),JSON.stringify(approved),{flag:'wx'})
      const authorize=async()=>{assert.equal(binding(commit,cache).fingerprint,fingerprint);await price(q,r)}
      proof.phase='BROWSER';const {browserRun}=await import('./candidate-live-browser.mjs');await browserRun({bound,base,entry,run,route:r,proof,authorize,images,confined})
    });if(mode==='live'){proof.phase='FINAL_BINDING';assert.equal(binding(commit,cache).fingerprint,fingerprint);assert.equal(proof.operations.length,2);assert.equal(proof.prepare_requests,2);assert.equal(proof.successful_model_selections,2);proof.status='PASS';proof.phase='COMPLETE'}
  }catch(error){if(mode==='live'&&proof.prepare_requests>0)proof.status='FAIL';process.exitCode=1;
    const detail=error instanceof Error&&/^FND005_(?:PRODUCT_ROUTE_MISMATCH|PREPARE_[1-5]\d\d_[A-Z0-9_]{1,64})$/.test(error.message)?' '+error.message:'';
    console.error('Stopped: '+proof.phase+detail)}finally{
    if(mode==='live'){proof.native_dispatches=[1,2].filter(i=>existsSync(join(run,'consumed-'+i))).length;proof.finished_at=new Date().toISOString();const path=publishProof(run,proof,images);console.log(JSON.stringify({status:proof.status,proof:path}))}
  }
}
main(process.argv.slice(2)).catch(()=>{console.error('Refused: arguments, frozen binding or private scratch precondition. See --help.');process.exitCode=1})
