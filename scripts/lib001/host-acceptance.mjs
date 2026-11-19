/** Run in the frozen checkout: node scripts/lib001/host-acceptance.mjs <commit> <entry-sha256> [evidence-parent] */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { binding, root, pkg } from '../fnd005/candidate-live-binding.mjs'
import { sha, uuid } from '../fnd005/candidate-live-guards.mjs'
import { api, dbPath } from '../fnd004/harness.mjs'
import { entryCookie, sleep } from '../fnd003/harness.mjs'

const [commit, entryHash, evidenceParent = join(root,'.cache/lib001-evidence')] = process.argv.slice(2)
assert(process.argv.length <= 5 && /^[0-9a-f]{40}$/.test(commit) && /^[0-9a-f]{64}$/.test(entryHash),
  'Usage: node scripts/lib001/host-acceptance.mjs <full-frozen-commit> <frozen-entry-sha256> [evidence-parent]')
const cache = resolve(process.env.KO_TEST_CACHE ?? join(root,'.cache'))
const bound = binding(commit,cache)
assert.equal(bound.facts.entry_sha256,entryHash,'frozen entry mismatch')
const self = fileURLToPath(import.meta.url)
const git = (...args)=>execFileSync('git',args,{cwd:root})
assert.equal(sha(readFileSync(self)),sha(git('show',commit+':scripts/lib001/host-acceptance.mjs')),'runner not frozen')
assert.equal(git('status','--porcelain','--','scripts/fnd003','scripts/fnd004','scripts/fnd006','scripts/lib001').toString().trim(),'')
const { query, until } = await import('../fnd006/independent/common.mjs')
const { chromium } = await import(pathToFileURL(bound.playwright).href)
mkdirSync(evidenceParent,{recursive:true}); const out=mkdtempSync(join(resolve(evidenceParent),'host-'))
const run=mkdtempSync(join(realpathSync(tmpdir()),'kos-lib001-')), home=join(run,'home'), data=join(run,'data'), profile='lib001-test'
const profileDir=join(home,'profiles',profile), product=join(profileDir,'node_modules/knowledgeos-panel')
mkdirSync(data);for(const path of git('ls-files','--',pkg+'/package.json',pkg+'/cordis.patch.yml',pkg+'/lib').toString().trim().split('\n')){
  const dest=join(product,path.slice(pkg.length+1));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(root,path)),{flag:'wx'})
}
const stagedEntry=realpathSync(join(product,'lib/index.js'));assert.equal(sha(readFileSync(stagedEntry)),entryHash)
const deps=join(product,'node_modules/@deepseek-ai');mkdirSync(deps,{recursive:true});symlinkSync(realpathSync(join(bound.runtime,'apps/cli/node_modules/@deepseek-ai/schemastery')),join(deps,'schemastery'),'junction')
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n')
write(join(profileDir,'package.json'),{name:'lib001-test',private:true,dependencies:{'knowledgeos-panel':'link:'+product.replaceAll('\\','/')},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','knowledgeos-panel']}}})
write(join(profileDir,'cordis.yml'),[]); write(join(profileDir,'cordis.patch.yml'),[{id:'knowledgeos-host',config:{dataDir:data.replaceAll('\\','/')}}])
const report={category:'REAL_DSH_CHROME_HTTP_SQLITE',...bound.facts,runner_sha256:sha(readFileSync(self)),node:process.version,
  scope:{T01:'import/restart',T02:'invalid PDF and repeated submission; disk-fault test separate',T03:'immutable versions and conflicts',T04:'identity and CSRF',T05:'NOT_RUN: separate migration test',T06:'browser round trip'},status:'RUNNING',events:[]}
let phase='setup',host,browser
function log(name,facts={}){report.events.push({at:new Date().toISOString(),name,...facts});write(join(out,'summary.json'),report)}
const socket=createServer(); await new Promise((ok,no)=>socket.once('error',no).listen(0,'127.0.0.1',ok)); const port=socket.address().port
await new Promise(ok=>socket.close(ok));const base='http://127.0.0.1:'+port, prefix='/knowledge/v1', library='/knowledgeos/library'
async function start(n){
  const trace=join(run,'boot-'+n);mkdirSync(trace)
  const env={};for(const [k,v] of Object.entries(process.env))if(/^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors)$/i.test(k))env[k]=v
  for(const k of ['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP']){env[k]=join(run,'env-'+k);mkdirSync(env[k],{recursive:true})}
  Object.assign(env,{DSH_HOME:home,DSH_CLIENT_COMMIT_HASH:bound.facts.upstream,TSX_DISABLE_CACHE:'1',KO_ENTRY:stagedEntry,KO_HASH:entryHash,KO_RUN:trace})
  const child=spawn(process.execPath,['--import',new URL('../fnd005/candidate-live-trace.mjs',import.meta.url).href,'--import','tsx/esm',
    'apps/cli/src/bin.ts','--profile',profile,'--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:bound.runtime,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let ended=false,tail='';const done=new Promise(ok=>{child.once('close',()=>{ended=true;ok()});child.once('error',()=>{ended=true;ok()})});host={child,done}
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{tail=(tail+chunk).slice(-32000)})
  const entry=await until(()=>{assert(!ended,'Host exited early');return existsSync(join(trace,'loaded.json')) && /dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]},'Host/loader readiness',90000)
  assert.equal(new URL(entry).origin,base);const loaded=JSON.parse(readFileSync(join(trace,'loaded.json'),'utf8'))
  assert.deepEqual(loaded,{pid:child.pid,hash:entryHash});log('host-loaded',{boot:n,...loaded});return entry
}
async function stop(){
  if(!host)return;const {child,done}=host
  if(child.exitCode===null && !child.signalCode)child.kill()
  let timer;try{await Promise.race([done,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('Host did not exit')),15000)})])}finally{clearTimeout(timer)}
  host=undefined;log('host-exited',{pid:child.pid})
}

function pdf(tag){
  let text='%PDF-1.4\n%\xff'+tag+'\n';const offsets=['0000000000 65535 f ']
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>']
  objects.forEach((obj,i)=>{offsets.push(String(text.length).padStart(10,'0')+' 00000 n ');text+=`${i+1} 0 obj\n${obj}\nendobj\n`})
  return Buffer.from(text+`xref\n0 4\n${offsets.join('\n')}\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${text.length}\n%%EOF\n`,'latin1')
}
const docs=[1,2].map(n=>({title:`合成讲义 #${n}%.pdf`,bytes:pdf('LIB-001 revision '+n)}))
const original=r=>`${prefix}/assets/${r.id}/versions/${r.version_id}/original`
const keys=['id','title','version_id','version','sha256','byte_length']
function checkReceipt(r,n){
  const doc=docs[n-1];assert.deepEqual(Object.keys(r).sort(),[...keys].sort());assert.match(r.id,uuid);assert.match(r.version_id,uuid)
  assert.equal(r.title,doc.title);assert.equal(r.version,n);assert.equal(r.sha256,sha(doc.bytes));assert.equal(r.byte_length,doc.bytes.length)
}
// One read transaction so counts and lineage describe the same instant. No paths, tokens or DB dumps in evidence.
function snapshot(){return query(data,db=>({
  counts:Object.fromEntries(['assets','asset_versions','blobs'].map(k=>[k,db.prepare('SELECT count(*) n FROM '+k).get().n])),
  rows:db.prepare(`SELECT v.asset_id id,v.id version_id,v.version,v.parent_version_id,v.original_name title,v.created_by,v.idempotency_key,
    b.sha256,b.byte_length,b.media_type,o.owner_user_id,o.space_id,o.scope_kind,o.revision FROM asset_versions v JOIN blobs b ON b.id=v.blob_id
    JOIN assets a ON a.id=v.asset_id JOIN knowledge_objects o ON o.id=a.id ORDER BY v.version`).all()
}))}
function database(label,versions,actor){
  const s=snapshot(),n=versions.length;assert.deepEqual(s.counts,{assets:n?1:0,asset_versions:n,blobs:n});assert.equal(s.rows.length,n)
  versions.forEach(({r,key},i)=>{const row=s.rows[i];for(const k of keys)assert.equal(row[k],r[k]);assert.equal(row.idempotency_key,key);assert.equal(row.parent_version_id,i?versions[i-1].r.version_id:null)
    assert.equal(row.media_type,'application/pdf');assert.equal(row.revision,n);assert.equal(row.scope_kind,'personal');assert.equal(row.created_by,actor.id);assert.equal(row.owner_user_id,actor.id);assert.equal(row.space_id,actor.personal_space_id)})
  log('sql:'+label,s);return s
}
async function actorPage(context,name,password){
  const page=await context.newPage();await page.goto(base+'/knowledgeos/account');await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password)
  await page.locator('#login').click();await page.locator('#profile').waitFor({state:'visible'})
  const me=await page.request.get(base+prefix+'/me');assert.equal(me.status(),200);const actor=(await me.json()).data
  assert.equal(actor.login_name,name);assert.match(actor.id,uuid);assert.match(actor.personal_space_id,uuid);return {page,actor}
}
async function show(page,n){
  assert.equal((await page.goto(base+library)).status(),200)
  const list=page.getByRole('region',{name:'我的资料'});await list.getByText(n?docs[n-1].title:'暂无资料',{exact:true}).waitFor()
  if(n)await list.getByText(sha(docs[n-1].bytes),{exact:true}).waitFor()
  return list
}
async function image(page,label){
  // Only the library main in a new, synthetic session; never the entry URL, login page, Host log or browser chrome.
  assert.equal(page.url(),base+library);const main=page.getByRole('main');await main.getByRole('heading',{name:'PDF 资料库',exact:true}).waitFor()
  const name=label+'.png',img=await main.screenshot({path:join(out,name)});log('browser:'+label,{file:name,sha256:sha(img)})
}
async function choose(page,name,bytes){
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel('PDF 文件',{exact:true}).click()]);await chooser.setFiles({name,mimeType:'application/pdf',buffer:bytes})
}
async function submit(page){
  const [r]=await Promise.all([page.waitForResponse(r=>r.url()===base+prefix+'/imports'&&r.request().method()==='POST'),page.getByRole('button',{name:'导入 PDF'}).click()]);return r
}
async function importUi(page,n,previous,actor){
  const prior=previous.at(-1)?.r, doc=docs[n-1];if(prior)await page.getByLabel('导入到').selectOption(prior.id);await choose(page,doc.title,doc.bytes)
  await image(page,`v${n}-before-submit`);const res=await submit(page),req=res.request(),h=req.headers();assert.equal(res.status(),201);const r=(await res.json()).data;checkReceipt(r,n)
  assert.equal(await req.headerValue('content-length'),String(doc.bytes.length));assert.equal(h['content-type'],'application/pdf');assert.equal(h['x-knowledgeos-request'],'1');assert.equal(h['x-knowledgeos-filename'],encodeURIComponent(doc.title))
  assert.equal(h['x-knowledgeos-asset-id'],prior?.id);assert.equal(h['x-knowledgeos-expected-version'],prior?String(prior.version):undefined);assert.match(h['idempotency-key'],uuid)
  const version={r,key:h['idempotency-key']};log('http:browser-import',{status:res.status(),receipt:r});database('first-read-after-v'+n,[...previous,version],actor)
  const receipt=page.getByRole('region',{name:'导入回执'});for(const text of [r.title,'v'+n,r.byte_length+' 字节',r.sha256])await receipt.getByText(text,{exact:true}).waitFor()
  assert.equal(await receipt.getByRole('link',{name:'查看原件'}).getAttribute('href'),original(r));assert.equal(await receipt.getByRole('link',{name:'导出 PDF'}).getAttribute('href'),original(r)+'?download=1')
  await image(page,`v${n}-receipt`);return version
}
async function readOriginal(req,r,download=false){
  const res=await req.get(base+original(r)+(download?'?download=1':''),{maxRedirects:0});assert.equal(res.status(),200)
  const h=res.headers(),bytes=await res.body();assert.equal(h['content-length'],String(r.byte_length));assert.equal(bytes.length,r.byte_length);assert.equal(sha(bytes),r.sha256)
  assert.deepEqual(bytes,docs[r.version-1].bytes);assert.equal(h['content-type'],'application/pdf');assert.equal(h['content-disposition'].split(';')[0],download?'attachment':'inline')
  log('http:original',{version:r.version,download,status:res.status(),length:bytes.length,sha256:sha(bytes)})
}
const put=(req,bytes,h)=>req.post(base+prefix+'/imports',{data:bytes,headers:h,maxRedirects:0})
const headers=(title,key=randomUUID())=>({'content-type':'application/pdf','x-knowledgeos-request':'1','x-knowledgeos-filename':encodeURIComponent(title),'idempotency-key':key})
async function deny(label,res,status,code){assert.equal(res.status(),status,label);const body=await res.json();assert.equal(body.code,code,label);assert.equal(body.data,undefined);log('http:'+label,{status,code})}

try {
  phase='first boot';const entry=await start(1);assert.equal(query(data,db=>db.prepare('SELECT count(*) n FROM users').get().n),0)
  database('before-bootstrap',[]);const pass=randomUUID(),owner=(await entryCookie(entry)).cookie;assert(owner)
  assert.equal((await api(port,owner,'POST',prefix+'/auth/bootstrap',{login_name:'testadmin',display_name:'Synthetic admin',password:randomUUID()})).status,201)
  for(const name of ['alice','bob'])assert.equal((await api(port,'','POST',prefix+'/auth/register',{login_name:name,display_name:name,password:pass})).status,201)
  phase='browser baseline';browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});log('chrome',{version:browser.version()})
  const context=()=>browser.newContext({viewport:{width:1100,height:850},serviceWorkers:'block',baseURL:base})
  const alice=await context(),bob=await context(),anon=await context();const {page,actor}=await actorPage(alice,'alice',pass)
  const bobPage=(await actorPage(bob,'bob',pass)).page;const anonPage=await anon.newPage();await anonPage.goto(base+library)
  await anonPage.getByRole('status').filter({hasText:'请先登录'}).waitFor();assert(await anonPage.getByLabel('PDF 文件',{exact:true}).isDisabled());await image(anonPage,'anonymous')
  await show(page,0);await image(page,'empty');database('before-v1',[])
  phase='first import';const v1=await importUi(page,1,[],actor);await readOriginal(alice.request,v1.r)
  phase='restart';const firstPid=host.child.pid;await stop();database('stopped',[v1],actor);await start(2);assert.notEqual(host.child.pid,firstPid)
  database('reopened',[v1],actor);const reopened=await show(page,1);await image(page,'restarted-v1');await readOriginal(alice.request,v1.r)
  const link=reopened.getByRole('link',{name:'查看原件'});assert.equal(await link.getAttribute('href'),original(v1.r))
  const inline=await link.evaluate(async a=>{const r=await fetch(a.href,{cache:'no-store',redirect:'error'}),bytes=await r.arrayBuffer();return {status:r.status,length:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}})
  assert.deepEqual(inline,{status:200,length:v1.r.byte_length,sha256:v1.r.sha256});log('browser:reopened-original',inline)
  const list=async(req,expected)=>{const res=await req.get(base+prefix+'/assets',{maxRedirects:0});assert.equal(res.status(),200);assert.deepEqual((await res.json()).data.items,expected)}
  await list(alice.request,[v1.r]);phase='version append';const v2=await importUi(page,2,[v1],actor),versions=[v1,v2]
  assert.equal(v2.r.id,v1.r.id);assert.notEqual(v2.r.version_id,v1.r.version_id);assert.notEqual(v2.key,v1.key)
  database('after-v2',versions,actor);await list(alice.request,[v2.r,v1.r]);await readOriginal(alice.request,v1.r);await readOriginal(alice.request,v2.r,true)
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('region',{name:'导入回执'}).getByRole('link',{name:'导出 PDF'}).click()]);assert.deepEqual(readFileSync(await download.path()),docs[1].bytes)
  phase='replay and conflicts';const firstHeaders=headers(v1.r.title,v1.key),secondHeaders={...headers(v2.r.title,v2.key),'x-knowledgeos-asset-id':v1.r.id,'x-knowledgeos-expected-version':'1'}
  for(const [i,h] of [firstHeaders,secondHeaders].entries()){
    const replay=await put(alice.request,docs[i].bytes,h);assert.equal(replay.status(),200);assert.deepEqual((await replay.json()).data,versions[i].r);log('http:exact-replay',{version:i+1,status:200})
  }
  await deny('same-key-changed-bytes',await put(alice.request,docs[1].bytes,firstHeaders),409,'IDEMPOTENCY_CONFLICT')
  await deny('new-key-stale-parent',await put(alice.request,docs[1].bytes,{...secondHeaders,'idempotency-key':randomUUID()}),409,'VERSION_CONFLICT');database('after-replay-and-conflicts',versions,actor)
  phase='invalid PDF';await choose(page,'合成损坏.pdf',Buffer.from('%PDF-1.4\ntruncated'));const invalid=await submit(page)
  await deny('invalid-pdf',invalid,422,'INVALID_PDF');await page.getByRole('status').filter({hasText:'重新选择'}).waitFor();await image(page,'invalid-pdf');database('after-invalid',versions,actor)
  phase='access boundaries';await list(bob.request,[]);await show(bobPage,0);await image(bobPage,'other-user-empty')
  const get=(ctx,path)=>ctx.request.get(base+path,{maxRedirects:0});const latestHeaders={...secondHeaders,'idempotency-key':randomUUID(),'x-knowledgeos-expected-version':'2'}
  for(const [ctx,tag,status,code] of [[bob,'other-user',404,'ASSET_NOT_FOUND'],[anon,'anonymous',401,'AUTH_REQUIRED']]){
    for(const suffix of ['','?download=1'])await deny(tag+'-original'+suffix,await get(ctx,original(v1.r)+suffix),status,code)
    await deny(tag+'-append',await put(ctx.request,docs[1].bytes,latestHeaders),status,code)
  }
  await deny('anonymous-list',await get(anon,prefix+'/assets'),401,'AUTH_REQUIRED')
  const noMarker=headers(docs[0].title);delete noMarker['x-knowledgeos-request']
  await deny('missing-csrf-marker',await put(alice.request,docs[0].bytes,noMarker),403,'CSRF_REJECTED')
  await deny('foreign-origin',await put(alice.request,docs[0].bytes,{...headers(docs[0].title),origin:'https://synthetic.invalid'}),403,'CSRF_REJECTED')
  database('after-denials',versions,actor);await readOriginal(alice.request,v1.r);await readOriginal(alice.request,v2.r)
  phase='expired session';const db=new DatabaseSync(dbPath(data));try{
    // Advance only the expiry of the one synthetic Alice session; Chrome retains its actual cookie.
    assert.equal(db.prepare('UPDATE auth_sessions SET expires_at=created_at WHERE user_id=? AND revoked_at IS NULL').run(actor.id).changes,1)
  }finally{db.close()}
  await deny('expired-list',await get(alice,prefix+'/assets'),401,'AUTH_REQUIRED');await deny('expired-original',await get(alice,original(v2.r)),401,'AUTH_REQUIRED')
  await page.getByRole('button',{name:'刷新资料'}).click();await page.getByRole('status').filter({hasText:'请先登录'}).waitFor();assert.equal(await page.locator('#result').textContent(),'');assert.equal(await page.locator('#list').textContent(),'');await image(page,'expired');database('final',versions,actor)
  phase='shutdown';await browser.close();browser=undefined;await stop();report.status='PASS'
}catch(e){
  process.exitCode=1;report.status='FAIL';report.failure={phase,type:e.name,line:String(e.stack).match(/host-acceptance\.mjs:(\d+)/)?.[1]};console.error('Failed:',JSON.stringify(report.failure))
}finally{
  try{await browser?.close()}finally{try{await stop()}finally{log('finished');console.log(report.status,join(out,'summary.json'))}}
}
