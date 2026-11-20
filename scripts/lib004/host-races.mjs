// Frozen candidate only. Real converter; test-only failure/hold at private PDF staging.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {setTimeout as sleep} from 'node:timers/promises'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {api,dbPath} from '../fnd004/harness.mjs'
import {entryCookie} from '../fnd003/harness.mjs'
import {acceptanceSamples} from './acceptance-samples.mjs'
import {openPdf} from '../../packages/knowledgeos-panel/lib/pdf-extractor.js'

const root=fileURLToPath(new URL('../../',import.meta.url)),[candidate,hash,parent=join(root,'.cache/lib004-races')]=process.argv.slice(2)
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root}),sha=x=>createHash('sha256').update(x).digest('hex')
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate);assert.match(hash,/^[a-f0-9]{64}$/)
const scopes=['scripts/lib004','scripts/lib002','scripts/fnd003','scripts/fnd004','scripts/fnd005'];assert.equal(git('status','--porcelain','--',...scopes).length,0)
mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(resolve(parent),'t02-')),report={candidate_sha:candidate,entry_sha256:hash,T02:'NOT_RUN',events:[]}
const save=()=>writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n'),log=(event,data={})=>{report.events.push({event,at:new Date().toISOString(),...data});save()}
let host,browser,ctx,page,name,password,phase='binding'
const send=async(path,status,opts={})=>{
  const res=await ctx.request.fetch(host.base+'/knowledge/v1'+path,{maxRedirects:0,...opts});assert.equal(res.status(),status,path+': '+res.status());return res
}
const post=async(path,status,body)=> (await (await send(path,status,{method:'POST',headers:{'x-knowledgeos-request':'1','idempotency-key':randomUUID()},...(body&&{data:body})})).json()).data
const base=r=>`/assets/${r.id}/versions/${r.version_id}`,office=r=>base(r)+'/office'
const get=async r=>(await (await send(office(r),200)).json()).data.conversions
const event=label=>until(()=>host.events().some(x=>x.event===label),label,60000)
async function inspect(bytes,version,count){const pdf=await openPdf(bytes);try{assert.equal(pdf.numPages,1);const {text}=await pdf.page(1);assert(text.includes('A08 sample V'+version));assert(new RegExp('\\b'+count+'\\b').test(text));return sha(bytes)}finally{await pdf.close()}}
async function state(r,j,wanted){const end=Date.now()+90000;let last;do{last=(await get(r)).find(c=>c.id===j);if(last?.state===wanted)return last;if(last&&['failed','cancelled','superseded','ready'].includes(last.state))break;await sleep(80)}while(Date.now()<end);throw Error('expected '+wanted+' observed '+last?.state+':'+last?.failure_code)}
async function login(){
  ctx=await browser.newContext({serviceWorkers:'block'});page=await ctx.newPage();await page.goto(host.base+'/knowledgeos/account');await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
}
async function upload(bytes,r){return (await (await send('/imports',201,{method:'POST',headers:{'x-knowledgeos-request':'1','idempotency-key':randomUUID(),'x-knowledgeos-filename':'race.docx','content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',...(r&&{'x-knowledgeos-asset-id':r.id,'x-knowledgeos-expected-version':String(r.version)})},data:bytes})).json()).data}
async function reviewImage(r,label,term){
  await page.goto(host.base+'/knowledgeos/library');await page.locator('#office-version').selectOption(r.version_id);await page.waitForFunction(s=>document.querySelector('#office-panel')?.innerText.includes(s),term)
  const bytes=await page.locator('#office-panel').screenshot({path:join(out,label+'.png')});log('screenshot',{label,sha256:sha(bytes)})
}
try{
  host=await isolate(candidate,hash,{officeBarrier:true});report.binding=host.facts;let boot=await host.start();log('boot',{pid:boot.pid})
  const {chromium}=await import(pathToFileURL(host.playwright).href);browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.chrome=browser.version()
  const cookie=(await entryCookie(boot.entry)).cookie;name='race'+randomUUID().slice(0,8);password=randomUUID()
  assert.equal((await api(host.port,cookie,'POST','/knowledge/v1/auth/bootstrap',{login_name:name,display_name:'Synthetic reviewer',password})).status,201)
  await login();report.T02='FAIL';phase='baseline'
  const samples=acceptanceSamples(),v1=samples['a08-v1.docx'],v2=samples['a08-v2.docx'],r=await upload(v1),begin=async x=>(await post(office(x)+'/start',202)).id
  const original=async x=>(await send(base(x)+'/original?download=1',200)).body(),pdf=async(x,j)=>(await send(office(x)+'/'+j+'/pdf?download=1',200)).body()
  const first=await begin(r);await state(r,first,'ready');const good=await inspect(await pdf(r,first),1,17);assert.notEqual(good,sha(v1));await post(office(r)+'/'+first+'/notes',201,{page:1,body:'T02 baseline observation'})
  const preserve=async()=>{assert.equal(sha(await pdf(r,first)),good);assert.deepEqual(await original(r),v1);const row=await state(r,first,'ready');assert.equal(row.notes[0].body,'T02 baseline observation');assert.equal((await get(r)).filter(x=>x.state==='ready').length,1)}
  log('baseline',{asset:r.id,version:r.version_id,conversion:first,original:sha(v1),pdf:good})
  phase='failure';host.officeFlag('fail-result');const failed=await begin(r);await event('entered-fail-result');const f=await state(r,failed,'failed');assert(f.failure_code);await preserve();log('failed',{code:f.failure_code})
  phase='cancellation';host.officeFlag('hold-cancel');const c=await begin(r);await event('entered-hold-cancel');assert.equal((await state(r,c,'running')).state,'running');await post(office(r)+'/'+c+'/cancel',200);host.officeFlag('release-cancel');await event('discarded-hold-cancel');await state(r,c,'cancelled');await preserve();log('cancelled-after-drain')
  phase='supersession';host.officeFlag('hold-stale');const stale=await begin(r);await event('entered-hold-stale');const changed=await upload(v2,r);assert.equal(changed.id,r.id);assert.equal(changed.version,2);host.officeFlag('release-stale');await event('discarded-hold-stale');await state(r,stale,'superseded');assert.deepEqual(await get(changed),[]);await preserve();log('superseded-after-drain')
  phase='new-version';const latest=await begin(changed);await state(changed,latest,'ready');const second=await inspect(await pdf(changed,latest),2,29);assert.notEqual(second,good);await preserve();assert.deepEqual(await original(changed),v2)
  phase='restart';await ctx.close();const prior=boot.pid;await host.stop();boot=await host.start();assert.notEqual(boot.pid,prior);await login();await preserve();assert.equal(sha(await pdf(changed,latest)),second);await state(r,c,'cancelled');await state(r,failed,'failed');await state(r,stale,'superseded');await reviewImage(r,'reopened-v1','T02 baseline observation')
  const db=new DatabaseSync(dbPath(host.data),{readOnly:true});try{assert.equal(db.prepare("SELECT count(*) n FROM blobs WHERE media_type='application/pdf'").get().n,2);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])}finally{db.close()}
  log('reopened',{pid:boot.pid,second_pdf:second,second_original:sha(v2)});report.T02='PASS'
}catch(e){report.failure={phase,message:String(e.message).replaceAll(root,'<repo>').slice(0,240)};process.exitCode=1}
finally{try{await browser?.close();await host?.stop()}finally{save();console.log('T02:',report.T02,'evidence:',out)}}
