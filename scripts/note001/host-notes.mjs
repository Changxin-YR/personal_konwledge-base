// Frozen NOTE-001 and A04 paths through isolated Host, Chrome and SQLite.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {entryCookie,api,dbPath,sql} from '../fnd004/harness.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'

const [candidate_sha,entry_sha256,parent='.cache/note001-host']=process.argv.slice(2)
const cwd=fileURLToPath(new URL('../../',import.meta.url)), self='scripts/note001/host-notes.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
const runner_sha256=sha(readFileSync(join(cwd,self)))
assert.equal(runner_sha256,sha(execFileSync('git',['show',candidate_sha+':'+self],{cwd})))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))
const password=randomUUID(),marker={'x-knowledgeos-request':'1'},prefix='/knowledge/v1'
const docText='Fixed original selection, original version only.', draft='My independent source commentary.'
const facts={candidate_sha,entry_sha256,runner_sha256,status:'NOT_RUN',exit:null,checks:[],screens:[],boots:[]}
let browser,host,phase='boot'
const pass=(id,details)=>facts.checks.push({id,status:'PASS',details})
async function response(ctx,url,code,opts={}){
  const r=await ctx.request.fetch(host.base+prefix+url,{maxRedirects:0,...opts});assert.equal(r.status(),code,`${url} returned HTTP ${r.status()}`);return r
}
const read=async(ctx,url,status=200)=>(await(await response(ctx,url,status)).json()).data
const post=async(ctx,url,data,status=201,headers={})=>(await(await response(ctx,url,status,{method:'POST',headers:{...marker,...headers},data})).json()).data
async function login(name,viewport={width:1280,height:900}){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor();return {ctx,page}
}
async function screen(page,name){const bytes=await page.screenshot({path:join(out,name),fullPage:true});facts.screens.push({name,sha256:sha(bytes)})}
const status=(page,s)=>page.locator('#status').filter({hasText:s}).waitFor()
const load=(page,id)=>page.goto(host.base+'/knowledgeos/notes?note='+id)
const asset=d=>`/assets/${d.id}/versions/${d.version_id}`
const rows=(q,args=[])=>sql(dbPath(host.data),q,args)
const importText=(ctx,text,prev)=>post(ctx,'/imports',Buffer.from(text),201,{
  'content-type':'text/plain','idempotency-key':randomUUID(),'x-knowledgeos-filename':'notes-source.txt',
  ...(prev?{'x-knowledgeos-asset-id':prev.id,'x-knowledgeos-expected-version':'1'}:{})
})
function projectAssetFixture(object,fixture){
  // Publishing project assets is outside NOTE-001. ACL changes go through the Host.
  const db=new DatabaseSync(dbPath(host.data));try{
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');db.prepare('INSERT INTO assets VALUES(?)').run(object.id)
    assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(object.id,fixture.version_id,fixture.id).changes,1)
    db.exec('COMMIT')
  }finally{db.close()}
}
async function assertRedacted(r,terms){
  const body=await r.text();for(const term of terms)assert(!body.includes(term),'unauthorized response contains protected data')
  return JSON.parse(body)
}
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
  assert.deepEqual((await read(peer.ctx,link)).items,[])
  await assertRedacted(await response(peer.ctx,notePath,404),[draft,'Working note',citation])
  await assertRedacted(await response(peer.ctx,'/citations/'+citation+'/resolve',404),[docText.slice(0,24),doc.version_id]);assert.equal((await read(ctx,link)).items[0].id,id)
  assert.equal(rows('SELECT count(*) n FROM project_note_refs WHERE note_id=?',[id])[0].n,1)
  pass('PROJECT_LINK_AND_PRIVATE_ACL',{same_note:true,replay_no_duplicates:true,peer_note:404,peer_project_items:0})

  phase='browser revision conflict';const other=await login('owner');await load(other.page,id);await status(other.page,'已打开笔记')
  await other.page.locator('#title').fill('Concurrent title');await other.page.locator('#body').fill('The version saved first.');await other.page.locator('#save').click();await status(other.page,'笔记已保存')
  await page.bringToFront();await page.locator('#body').fill('My stale-tab draft.');await page.locator('#save').click();await page.locator('#conflict').waitFor()
  assert.equal(await page.locator('#latest-body').innerText(),'The version saved first.');assert.equal(await page.locator('#body').inputValue(),'My stale-tab draft.')
  assert.equal((await read(ctx,notePath)).body,'The version saved first.');await screen(page,'conflict-desktop.png')
  await page.locator('#rebase').click();await status(page,'已保留草稿');assert.equal(await page.locator('#title').inputValue(),'Concurrent title')
  await page.locator('#save').click();await status(page,'笔记已保存')
  const recovered=await read(ctx,notePath);assert.equal(recovered.body,'My stale-tab draft.');assert.equal(recovered.title,'Concurrent title')
  pass('CONFLICT_DRAFT_PRESERVED',{draft_not_overwritten:true,untouched_field_preserved:true,explicit_retry:true})

  phase='four note kinds and replacement source';const kinds=[{id,kind:'reading',body:'My stale-tab draft.',revision:3}]
  for(const kind of ['plain','project','reflection']){
    await page.locator('#new').click();await status(page,'新笔记');await page.locator('#kind').selectOption(kind)
    await page.locator('#title').fill(kind+' notebook');await page.locator('#body').fill('Independent text for '+kind)
    await page.locator('#save').click();await status(page,'笔记已保存')
    await page.locator('#body').fill('Edited text for '+kind);await page.locator('#save').click();await page.locator('#revision').filter({hasText:'修订 2'}).waitFor()
    kinds.push({id:new URL(page.url()).searchParams.get('note'),kind,body:'Edited text for '+kind,revision:2})
  }
  const replacement='Replacement source. Never retarget an older note.'
  const newer=await importText(ctx,replacement,doc);assert.equal(newer.id,doc.id);assert.notEqual(newer.version_id,doc.version_id)
  assert.equal((await read(ctx,asset(newer)+'/reader?unit=1')).text,replacement)

  phase='shared asset and revocation';const sensitive='Revocable project source selection, not note content.'
  const object=await post(ctx,'/objects',{scope:'project',project_id:project.id,object_type:'asset',title:'Revocable project source',body:'Synthetic fixture'})
  const fixture=await importText(ctx,sensitive);projectAssetFixture(object,fixture)
  const shared={id:object.id,version_id:fixture.version_id}, sharedReader=asset(shared)+'/reader?unit=1'
  await response(peer.ctx,sharedReader,404)
  const grant=await post(ctx,'/grants',{object_id:object.id,subject_type:'user',subject_id:viewer.id,action:'read'})
  const sharedSpec={asset_id:object.id,version_id:fixture.version_id,ordinal:1,start:0,end:26,source_hash:sha(sensitive)}
  const sharedCitation=await post(peer.ctx,'/citations',sharedSpec,201,{'idempotency-key':randomUUID()}),target='/citations/'+sharedCitation.id+'/resolve'
  assert.equal((await read(peer.ctx,target)).quote,sensitive.slice(0,26))
  const annotation='My private commentary about a project document.'
  const sharedNote=await post(peer.ctx,'/notes',{actor_id:viewer.id,title:'Private source commentary',kind:'reading',body:annotation,add_citation:sharedCitation.id},201,{'idempotency-key':randomUUID()})
  await post(peer.ctx,link,{actor_id:viewer.id,note_id:sharedNote.id},404)
  assert.equal(rows('SELECT count(*) n FROM project_note_refs WHERE note_id=?',[sharedNote.id])[0].n,0)
  await load(peer.page,sharedNote.id);await status(peer.page,'已打开笔记');await peer.page.getByRole('link',{name:'原文引用 1'}).waitFor()
  const sharedNotePath='/notes/'+sharedNote.id, changedTitle='Edited project commentary', draftBody=annotation+' Draft kept.'
  await response(peer.ctx,sharedNotePath,200,{method:'PATCH',headers:marker,data:{actor_id:viewer.id,expected_revision:1,title:changedTitle}})
  await peer.page.locator('#body').fill(draftBody);await peer.page.locator('#save').click();await peer.page.locator('#conflict').waitFor()
  await response(ctx,'/grants/revoke',204,{method:'POST',headers:marker,data:{grant_id:grant.id}})
  const secretTerms=[sensitive.slice(0,26),shared.id,shared.version_id,sharedCitation.id,'Revocable project source']
  await assertRedacted(await response(peer.ctx,target,404),secretTerms);await assertRedacted(await response(peer.ctx,sharedReader,404),secretTerms)
  const lost=await assertRedacted(await response(peer.ctx,'/notes/'+sharedNote.id,200),secretTerms)
  assert.equal(lost.data.body,annotation);assert.deepEqual(lost.data.references,[{id:sharedNote.references[0].id,status:'unavailable'}])
  await peer.page.locator('#rebase').click();await status(peer.page,'已保留草稿');await peer.page.getByText('来源不可用',{exact:true}).waitFor()
  assert.equal(await peer.page.locator('#body').inputValue(),draftBody);assert.equal(await peer.page.locator('#title').inputValue(),changedTitle)
  assert.equal(await peer.page.locator('#references a').count(),0);await peer.page.locator('#save').click();await status(peer.page,'笔记已保存')
  await load(peer.page,sharedNote.id);await status(peer.page,'已打开笔记');await peer.page.getByText('来源不可用',{exact:true}).waitFor()
  assert.equal(await peer.page.locator('#references a').count(),0);assert.equal(await peer.page.locator('#body').inputValue(),draftBody)
  const markup=await peer.page.locator('#workspace').innerHTML();for(const term of secretTerms)assert(!markup.includes(term))
  await screen(peer.page,'revoked-source.png')
  await peer.page.getByRole('button',{name:'移除引用'}).click();await status(peer.page,'笔记已保存')
  const unlinked=await read(peer.ctx,'/notes/'+sharedNote.id);assert.deepEqual(unlinked.references,[]);assert.equal(unlinked.body,draftBody)
  assert.equal((await read(ctx,target)).quote,sensitive.slice(0,26));assert.equal(sha(await(await response(ctx,asset(shared)+'/original',200)).body()),sha(sensitive))
  pass('REAL_GRANT_REVOKED_WITHOUT_NOTE_OR_SOURCE_LOSS',{fixture:'project asset binding only',before:200,after:404,redacted_payload:true,rebase_does_not_restore_link:true,removed_in_browser:true,owner_source_unchanged:true,member_cannot_link_own_note:true})

  phase='account switch with delayed real note response';const changing=await login('owner');await changing.page.goto(host.base+'/knowledgeos/notes');await status(changing.page,'新笔记')
  let received,release,finished;const captured=new Promise(ok=>{received=ok}),gate=new Promise(ok=>{release=ok}),drained=new Promise(ok=>{finished=ok})
  await changing.page.route(host.base+prefix+notePath,async route=>{
    try{const oldResponse=await route.fetch();received(oldResponse.status());await gate;await route.fulfill({response:oldResponse})}finally{finished()}
  },{times:1})
  try{
    await changing.page.getByRole('button',{name:'Concurrent title',exact:true}).click()
    assert.equal(await Promise.race([captured,drained]),200)
    await response(changing.ctx,'/auth/login',200,{method:'POST',headers:marker,data:{login_name:'peer',password}})
    assert.equal((await read(changing.ctx,'/me')).id,viewer.id)
  }finally{release()}
  await drained;await status(changing.page,'账号已切换');assert(await changing.page.locator('#workspace').isHidden())
  assert.equal(await changing.page.locator('#body').inputValue(),'');assert.equal(await changing.page.locator('#list button').count(),0)
  await changing.ctx.close();pass('DELAYED_PRIOR_ACCOUNT_RESPONSE_DISCARDED',{real_a_response:200,switched_to_b:true,cleared_editor:true})

  phase='restart, original and link removal';await owner.ctx.close();await peer.ctx.close();await other.ctx.close();await host.stop()
  facts.boots.push((await host.start()).pid);assert.notEqual(facts.boots[0],facts.boots[1]);const mobile=await login('owner',{width:390,height:844})
  for(const n of kinds){
    await load(mobile.page,n.id);await status(mobile.page,'已打开笔记')
    assert.equal(await mobile.page.locator('#body').inputValue(),n.body);assert.equal(await mobile.page.locator('#kind').inputValue(),n.kind)
    assert.equal(await mobile.page.locator('#revision').innerText(),'修订 '+n.revision)
  }
  pass('FOUR_EDITED_NOTE_KINDS_RESTORED',{kinds:kinds.map(({kind,revision})=>({kind,revision})),restart:true})
  await load(mobile.page,id);await status(mobile.page,'已打开笔记')
  assert.equal(await mobile.page.locator('#body').inputValue(),'My stale-tab draft.')
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  const original=mobile.page.getByRole('link',{name:'原文引用 1'});assert.equal(new URL(await original.getAttribute('href'),host.base).searchParams.get('version'),doc.version_id)
  await screen(mobile.page,'restored-mobile.png')
  const [oldReader]=await Promise.all([mobile.page.waitForEvent('popup'),original.click()]);await oldReader.locator('#text').waitFor();assert.equal(await oldReader.locator('#text').innerText(),docText)
  await oldReader.close();await mobile.page.bringToFront()
  assert.equal((await read(mobile.ctx,'/citations/'+citation+'/resolve')).quote,docText.slice(0,24))
  pass('FIXED_REFERENCE_AFTER_SOURCE_REPLACEMENT',{old_sha256:sha(docText),current_sha256:sha(replacement),browser_read_old:true})
  await load(mobile.page,id);await status(mobile.page,'已打开笔记')
  await mobile.page.getByRole('button',{name:'移除引用'}).click();await status(mobile.page,'笔记已保存');assert.deepEqual((await read(mobile.ctx,notePath)).references,[])
  phase='A04 restart after unlink';await mobile.ctx.close();await host.stop();facts.boots.push((await host.start()).pid);assert.equal(new Set(facts.boots).size,3)
  const restored=await login('owner');await load(restored.page,id);await status(restored.page,'已打开笔记')
  await restored.page.getByText('暂无引用',{exact:true}).waitFor();assert.equal(await restored.page.locator('#body').inputValue(),'My stale-tab draft.')
  await restored.page.locator('#projects').selectOption(project.id);await restored.page.locator('#project-list').getByRole('button',{name:'Concurrent title'}).waitFor()
  assert.deepEqual((await read(restored.ctx,link)).items.map(n=>n.id),[id])
  const library=await read(restored.ctx,'/assets');assert(library.items.some(item=>item.id===doc.id&&item.version_id===newer.version_id))
  assert(!library.items.some(item=>kinds.some(n=>n.id===item.id)))
  const bytes=await(await response(restored.ctx,asset(doc)+'/original',200)).body();assert.equal(sha(bytes),sha(docText))
  assert.equal((await read(restored.ctx,'/citations/'+citation+'/resolve')).version_id,doc.version_id)
  assert.equal(rows('SELECT count(*) n FROM notes WHERE id=?',[id])[0].n,1)
  for(const n of kinds)assert.equal(rows('SELECT count(*) n FROM knowledge_objects WHERE id=?',[n.id])[0].n,0)
  assert.equal(rows('SELECT count(*) n FROM project_note_refs WHERE note_id=?',[id])[0].n,1)
  assert.equal(rows('PRAGMA user_version')[0].user_version,21)
  assert.deepEqual(rows('PRAGMA foreign_key_check'),[])
  pass('ORIGINAL_UNCHANGED_AFTER_RESTART_AND_UNLINK',{sha256:sha(bytes),schema:21,project_reference_retained:true,notes_in_library:0});facts.status='PASS'
}catch(e){facts.status='FAIL';facts.failure={phase,type:e.name,line:String(e.stack).match(/host-notes\.mjs:\d+/)?.[0]}}
finally{try{await browser?.close()}finally{await host?.stop()};facts.exit=facts.status==='PASS'?0:1;writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(facts.status,out,facts.failure?.phase??'');process.exitCode=facts.exit}
