// Real isolated Host, Chrome, business cookies and SQLite. A smoke run is not independent acceptance.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {entryCookie,api,dbPath,sql} from '../fnd004/harness.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'

const [candidate_sha,entry_sha256,parent='.cache/note001-host']=process.argv.slice(2)
const cwd=fileURLToPath(new URL('../../',import.meta.url)), self='scripts/note001/host-notes.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
assert.equal(sha(readFileSync(join(cwd,self))),sha(execFileSync('git',['show',candidate_sha+':'+self],{cwd})))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))
const password=randomUUID(),marker={'x-knowledgeos-request':'1'},prefix='/knowledge/v1'
const docText='Fixed original selection, original version only.', draft='My independent source commentary.'
const facts={candidate_sha,entry_sha256,status:'NOT_RUN',exit:null,checks:[],screens:[],boots:[]}
let browser,host,phase='boot'
const pass=(id,details)=>facts.checks.push({id,status:'PASS',details})
async function response(ctx,url,code,opts={}){
  const r=await ctx.request.fetch(host.base+prefix+url,{maxRedirects:0,...opts});assert.equal(r.status(),code,`${url} returned HTTP ${r.status()}`);return r
}
const read=async(ctx,url,status=200)=>(await(await response(ctx,url,status)).json()).data
const post=async(ctx,url,data,status=201)=>(await(await response(ctx,url,status,{method:'POST',headers:marker,data})).json()).data
async function login(name,viewport={width:1280,height:900}){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor();return {ctx,page}
}
async function screen(page,name){const bytes=await page.screenshot({path:join(out,name),fullPage:true});facts.screens.push({name,sha256:sha(bytes)})}
const status=(page,s)=>page.locator('#status').filter({hasText:s}).waitFor()
const load=(page,id)=>page.goto(host.base+'/knowledgeos/notes?note='+id)
const asset=d=>`/assets/${d.id}/versions/${d.version_id}`
const rows=(q,args=[])=>sql(dbPath(host.data),q,args)
try{
  host=await isolate(candidate_sha,entry_sha256);facts.binding=host.facts
  const boot1=await host.start(),entry=await entryCookie(boot1.entry);facts.boots.push(boot1.pid)
  assert.equal((await api(host.port,entry.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})).status,201)
  assert.equal((await api(host.port,'','POST',prefix+'/auth/register',{login_name:'peer',display_name:'Peer',password})).status,201)
  const {chromium}=await import(pathToFileURL(host.playwright));browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});facts.chrome=browser.version()
  const owner=await login('owner'),peer=await login('peer'),{ctx,page}=owner,me=await read(ctx,'/me'),viewer=await read(peer.ctx,'/me')
  const project=await post(ctx,'/projects',{name:'Reproducible notebook project'})
  await response(ctx,`/projects/${project.id}/memberships`,204,{method:'POST',headers:marker,data:{user_id:viewer.id,role:'member'}})
  phase='browser import and citation';await page.goto(host.base+'/knowledgeos/library');await page.locator('#mode:enabled').selectOption('text')
  await page.locator('#file').setInputFiles({name:'notes-source.txt',mimeType:'text/plain',buffer:Buffer.from(docText)})
  const [upload]=await Promise.all([page.waitForResponse(r=>r.url()===host.base+prefix+'/imports'&&r.request().method()==='POST'),page.locator('#submit').click()]);assert.equal(upload.status(),201)
  const doc=(await upload.json()).data;assert.equal(doc.sha256,sha(docText))
  await page.goto(host.base+`/knowledgeos/reader?asset=${doc.id}&version=${doc.version_id}&unit=1`)
  const text=page.locator('#text');await text.waitFor();assert.equal(await text.innerText(),docText)
  await text.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,24);getSelection().removeAllRanges();getSelection().addRange(r)})
  await page.locator('#cite').click();const jump=page.getByRole('link',{name:'记笔记'});await jump.waitFor()
  const citation=new URL(await jump.getAttribute('href'),host.base).searchParams.get('citation');assert(citation)
  await jump.click();await status(page,'新笔记');assert.equal(await page.locator('#kind').inputValue(),'reading')
  await page.locator('#title').fill('Working note');await page.locator('#body').fill(draft);await page.locator('#save').click();await status(page,'笔记已保存')
  const id=new URL(page.url()).searchParams.get('note'),notePath='/notes/'+id
  const made=await read(ctx,notePath);assert.equal(made.body,draft);assert.equal(made.references[0].citation_id,citation)
  assert.equal(made.references[0].version_id,doc.version_id);assert.equal((await read(ctx,'/citations/'+citation+'/resolve')).quote,docText.slice(0,24))
  pass('FIXED_BROWSER_REFERENCE',{content_sha256:sha(docText),note_kind:made.kind,revision:made.revision,physical_position:1})

  phase='project membership and privacy';await page.locator('#projects').selectOption(project.id);await page.locator('#link-project').click();await status(page,'项目引用已保存')
  await page.locator('#project-list').getByRole('button',{name:'Working note'}).waitFor()
  const link='/notes/projects/'+project.id;assert.equal((await post(ctx,link,{note_id:id,actor_id:me.id},200)).replayed,true)
  assert.deepEqual((await read(peer.ctx,link)).items,[]);await response(peer.ctx,notePath,404);assert.equal((await read(ctx,link)).items[0].id,id)
  assert.equal(rows('SELECT count(*) n FROM project_note_refs WHERE note_id=?',[id])[0].n,1)
  pass('PROJECT_LINK_AND_PRIVATE_ACL',{same_note:true,replay_no_duplicates:true,peer_note:404,peer_project_items:0})

  phase='browser revision conflict';const other=await login('owner');await load(other.page,id);await status(other.page,'已打开笔记')
  await other.page.locator('#body').fill('The version saved first.');await other.page.locator('#save').click();await status(other.page,'笔记已保存')
  await page.bringToFront();await page.locator('#body').fill('My stale-tab draft.');await page.locator('#save').click();await page.locator('#conflict').waitFor()
  assert.equal(await page.locator('#latest-body').innerText(),'The version saved first.');assert.equal(await page.locator('#body').inputValue(),'My stale-tab draft.')
  assert.equal((await read(ctx,notePath)).body,'The version saved first.');await screen(page,'conflict-desktop.png')
  await page.locator('#rebase').click();await status(page,'已保留草稿');await page.locator('#save').click();await status(page,'笔记已保存')
  assert.equal((await read(ctx,notePath)).body,'My stale-tab draft.')
  pass('CONFLICT_DRAFT_PRESERVED',{draft_not_overwritten:true,explicit_retry:true})

  phase='restart, original and link removal';await owner.ctx.close();await peer.ctx.close();await other.ctx.close();await host.stop()
  facts.boots.push((await host.start()).pid);const mobile=await login('owner',{width:390,height:844});await load(mobile.page,id);await status(mobile.page,'已打开笔记')
  assert.equal(await mobile.page.locator('#body').inputValue(),'My stale-tab draft.')
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  const original=mobile.page.getByRole('link',{name:'原文引用 1'});assert.equal(new URL(await original.getAttribute('href'),host.base).searchParams.get('version'),doc.version_id)
  await screen(mobile.page,'restored-mobile.png')
  await mobile.page.getByRole('button',{name:'移除引用'}).click();await status(mobile.page,'笔记已保存');assert.deepEqual((await read(mobile.ctx,notePath)).references,[])
  const bytes=await(await response(mobile.ctx,asset(doc)+'/original',200)).body();assert.equal(sha(bytes),sha(docText))
  assert.equal((await read(mobile.ctx,'/citations/'+citation+'/resolve')).version_id,doc.version_id)
  assert.equal(rows('SELECT count(*) n FROM notes WHERE id=?',[id])[0].n,1)
  assert.equal(rows('SELECT count(*) n FROM knowledge_objects WHERE id=?',[id])[0].n,0)
  assert.equal(rows('SELECT count(*) n FROM project_note_refs WHERE note_id=?',[id])[0].n,1)
  assert.equal(rows('PRAGMA user_version')[0].user_version,21)
  pass('ORIGINAL_UNCHANGED_AFTER_RESTART_AND_UNLINK',{sha256:sha(bytes),schema:21,project_reference_retained:true,notes_in_library:0});facts.status='PASS'
}catch(e){facts.status='FAIL';facts.failure={phase,message:(e.stack??String(e)).slice(0,2500)}}
finally{try{await browser?.close()}finally{await host?.stop()};facts.exit=facts.status==='PASS'?0:1;writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(facts.status,out,facts.failure?.phase??'');process.exitCode=facts.exit}
