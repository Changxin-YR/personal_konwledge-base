// From repository root: node <this file> <commit> <entry SHA-256> [evidence parent]
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs'
import {basename,dirname,join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {setTimeout as sleep} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {isolate} from '../../scripts/lib002/a07-isolated-host.mjs'
import {api,entryCookie,login,dbPath,sql} from '../../scripts/fnd004/harness.mjs'

const [candidate,entry,parent='.cache/read003-visibility-independent']=process.argv.slice(2)
assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entry,/^[a-f0-9]{64}$/)
const source=fileURLToPath(import.meta.url), root=resolve(dirname(source),'../..')
assert.equal(realpathSync(process.cwd()),realpathSync(root))
mkdirSync(parent,{recursive:true})
const evidence=realpathSync(parent),out=mkdtempSync(join(evidence,'native-product-')),scratch=mkdtempSync(join(evidence,'t-native-'))
const profile=join(scratch,'chrome')
process.env.KO_TEST_CACHE=join(root,'.cache');process.env.TEMP=scratch;process.env.TMP=scratch
const chrome=process.env.KO_CHROME_EXE ?? [process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA]
  .filter(Boolean).map(x=>join(x,'Google','Chrome','Application','chrome.exe')).find(existsSync)
const flags=['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']
const prefix='/knowledge/v1',password=randomUUID(),account='annotation-reader',publisher='project-fixture-owner'
const report={candidate,entry,harness_sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),status:'NOT_RUN',cases:{},setup:{
  args:['--user-data-dir=<fresh profile>',...flags,'<isolated Host>/knowledgeos/account'],
  tabs:'Browser-level Target.activateTarget; same window and default context; no Playwright, focus emulation or visibility overrides.',
  responses:'CDP Fetch holds real PATCH responses at the response boundary; no response contents or status codes are synthesized.',
  fixtures:'Synthetic accounts and text; project source seeded in isolated SQLite, grants and writes through Host.'}}
let host,proc,closed,ws,db,phase='binding',seq=0,who,owner
const pending=new Map(),notices=[]
const wait=async(fn,label,ms=12000)=>{const end=Date.now()+ms;do{const x=await fn();if(x)return x;await sleep(50)}while(Date.now()<end);throw Error('timeout: '+label)}
const cmd=(method,params={},sessionId)=>new Promise((ok,no)=>{
  const id=++seq,t=setTimeout(()=>{pending.delete(id);no(Error('timeout: '+method))},6000)
  pending.set(id,m=>{clearTimeout(t);m.error?no(Error(method+' rejected')):ok(m.result)})
  ws.send(JSON.stringify({id,method,params,sessionId}))
})
const js=async(s,expression)=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},s);if(r.exceptionDetails)throw Error('browser evaluation failed');return r.result.value}
const until=(s,expr,label)=>wait(async()=>{try{return await js(s,expr)}catch{return false}},label)
const attach=async targetId=>(await cmd('Target.attachToTarget',{targetId,flatten:true})).sessionId
const el=id=>`document.getElementById(${JSON.stringify(id)})`
const text=el('text'),list=el('annotation-items'),form=el('annotation-form'),draft=el('annotation-body'),rebase=el('annotation-rebase')
const row=`document.querySelector('#annotation-items [data-annotation-id]')`
const click=(s,id)=>js(s,`${el(id)}.click();true`)
const fill=(s,body)=>js(s,`${draft}.value=${JSON.stringify(body)};true`)
const visible=s=>until(s,`${text}?.hidden===false`,'reader content visible')
const active=async(targetId,s)=>{await cmd('Target.activateTarget',{targetId});await until(s,'!document.hidden','native foreground')}
const watch=s=>js(s,`if(!window.__events)document.addEventListener('visibilitychange',e=>window.__events.push({hidden:document.hidden,trusted:e.isTrusted}));window.__events=[];true`)
const state=s=>js(s,`({draftEmpty:!${draft}.value,listEmpty:!${list}.childElementCount,sourceEmpty:!${text}.textContent,formHidden:${form}.hidden})`)
const hidden=async s=>{await until(s,'document.hidden&&window.__events.some(e=>e.hidden&&e.trusted)','trusted hide');const v=await state(s);assert(Object.values(v).every(Boolean));return v}
async function pair(s){const events=await js(s,'window.__events');assert.deepEqual(events,[{hidden:true,trusted:true},{hidden:false,trusted:true}]);return events}
const href=d=>host.base+'/knowledgeos/reader?'+new URLSearchParams({asset:d.id,version:d.version_id,unit:1})
const open=(s,d)=>cmd('Page.navigate',{url:href(d)},s)
const panel=async s=>{await visible(s);if(await js(s,`${el('annotations')}.hidden`))await click(s,'annotations-toggle');await until(s,`!!${row}`,'annotation list')}
const edit=async(s,body)=>{await js(s,`[...${row}.querySelectorAll('button')].find(b=>b.textContent==='\u7f16\u8f91').click();true`);await fill(s,body);await until(s,`!${form}.hidden`,'edit form')}
const saved=s=>until(s,`${form}.hidden`,'save acknowledgement')
const editor=body=>`!${form}.hidden&&${draft}.value===${JSON.stringify(body)}`
const restored=(s,body)=>until(s,editor(body),'restored draft')
const conflict=(s,body)=>until(s,`${editor(body)}&&!${rebase}.hidden&&${el('annotation-submit')}.disabled`,'stale save retaining draft')
const ann=d=>`/assets/${d.id}/versions/${d.version_id}/reader-annotations?unit=1`
async function makeNote(s){
  await visible(s);await js(s,`(()=>{const n=${text}.firstChild,r=document.createRange(),i=n.textContent.lastIndexOf('repeat me');r.setStart(n,i);r.setEnd(n,i+9);getSelection().addRange(r);return true})()`)
  await until(s,`!${el('annotate')}.disabled`,'selection');await click(s,'annotate');await until(s,`!${form}.hidden`,'create form')
  await fill(s,'Saved synthetic annotation');await click(s,'annotation-submit');await saved(s);await until(s,`!!${row}`,'new annotation row')
}
async function request(w,method,path,status,body){const r=await api(host.port,w.cookie,method,prefix+path,body);assert.equal(r.status,status);return r.json?.data}
async function upload(w,name){
  const r=await fetch(host.base+prefix+'/imports',{method:'POST',headers:{cookie:w.cookie,'x-knowledgeos-request':'1','content-type':'text/markdown',
    'idempotency-key':randomUUID(),'x-knowledgeos-filename':name},body:'First repeat me; then repeat me here.'})
  assert.equal(r.status,201);return (await r.json()).data
}
async function revision(d,n,body){
  const h=await request(who,'GET',ann(d),200)
  const rows=sql(db,'SELECT a.body,a.revision FROM reader_annotations a JOIN citations c ON c.id=a.citation_id WHERE c.version_id=?',[d.version_id])
  assert.equal(h.items.length,1);assert.equal(rows.length,1);assert.equal(h.items[0].body,body);assert.equal(rows[0].body,body)
  const r={http:h.items[0].revision,sqlite:rows[0].revision};assert.deepEqual(r,{http:n,sqlite:n});return r
}
async function pausedPatch(s,status,work){
  const offset=notices.length
  await cmd('Fetch.enable',{patterns:[{urlPattern:'*/reader-annotations/*',requestStage:'Response'}]},s)
  try{
    await click(s,'annotation-submit')
    const r=await wait(()=>notices.slice(offset).find(m=>m.sessionId===s),'actual PATCH response paused')
    assert.equal(r.responseStatusCode,status);await work()
    try{await cmd('Fetch.continueResponse',{requestId:r.requestId},s)}catch{await cmd('Fetch.continueRequest',{requestId:r.requestId},s)}
    return r.responseStatusCode
  }finally{await cmd('Fetch.disable',{},s)}
}
async function run(name,fn){phase=name;try{report.cases[name]={status:'PASS',...await fn()}}catch(e){report.cases[name]={status:'FAIL'};throw e}}
try {
  host=await isolate(candidate,entry);report.binding=host.facts;phase='Host and synthetic accounts'
  const {entry:url}=await host.start(),{cookie}=await entryCookie(url);db=dbPath(host.data)
  await request({cookie},'POST','/auth/bootstrap',201,{login_name:'setup',display_name:'Setup fixture',password})
  for(const name of [account,publisher])await request({cookie:''},'POST','/auth/register',201,{login_name:name,display_name:name,password})
  who=await login(host.port,account,password);owner=await login(host.port,publisher,password)
  assert.equal(who.response.status,200);assert.equal(owner.response.status,200)
  const doc=await upload(who,'native-annotations.md'),actor=(await request(who,'GET','/me',200)).id
  phase='stock Chrome startup';assert(chrome)
  proc=spawn(chrome,[`--user-data-dir=${profile}`,...flags,host.base+'/knowledgeos/account'],{stdio:'ignore',windowsHide:true})
  closed=new Promise(ok=>{proc.once('close',ok);proc.once('error',ok)})
  const dev=join(profile,'DevToolsActivePort')
  const [port,route]=await wait(()=>{if(existsSync(dev)){const f=readFileSync(dev,'utf8').trim().split(/\r?\n/);if(f.length===2)return f}},'DevToolsActivePort')
  ws=new WebSocket('ws://127.0.0.1:'+port+route)
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),fn=pending.get(m.id)
    if(fn){pending.delete(m.id);fn(m)}else if(m.method==='Fetch.requestPaused'&&m.params.request.method==='PATCH')
      notices.push({sessionId:m.sessionId,requestId:m.params.requestId,responseStatusCode:m.params.responseStatusCode})})
  await wait(()=>ws.readyState===WebSocket.OPEN,'browser WebSocket');report.chrome=(await cmd('Browser.getVersion')).product
  const a=await wait(async()=> (await cmd('Target.getTargets')).targetInfos.find(x=>x.type==='page'&&x.url.endsWith('/knowledgeos/account'))?.targetId,'account target'),sa=await attach(a)
  phase='login in Chrome';await until(sa,`typeof ${el('login')}?.onclick==='function'`,'account handlers ready')
  await js(sa,`${el('login_name')}.value=${JSON.stringify(account)};${el('login_password')}.value=${JSON.stringify(password)};${el('login')}.click();true`)
  await until(sa,`${el('profile')}?.classList.contains('hidden')===false`,'profile visible after authentication')
  assert.equal(await js(sa,`fetch('/knowledge/v1/me').then(async r=>r.ok?(await r.json()).data.id:null)`),actor)
  phase='create annotation and second tab';await active(a,sa);await open(sa,doc);await makeNote(sa)
  const b=(await cmd('Target.createTarget',{url:href(doc),background:true})).targetId,sb=await attach(b)
  const windowOf=async targetId=>(await cmd('Browser.getWindowForTarget',{targetId})).windowId
  report.same_window=await windowOf(a)===await windowOf(b);assert(report.same_window)
  await active(b,sb);await panel(sb);await active(a,sa);await panel(sa)

  await run('native_restore_conflict',async()=>{
    const body='Unsaved synthetic normal draft',winner='Other tab saved revision two'
    await edit(sa,body);await watch(sa);await active(b,sb);const cleared=await hidden(sa)
    await panel(sb);await edit(sb,winner);await click(sb,'annotation-submit');await saved(sb);await revision(doc,2,winner)
    await active(a,sa);await restored(sa,body)
    const status=await pausedPatch(sa,409,async()=>{});await conflict(sa,body)
    return {events:await pair(sa),clear_on_hide:cleared,patch_status:status,revision:await revision(doc,2,winner)}
  })
  await run('native_read_revocation',async()=>{
    const project=await request(owner,'POST','/projects',201,{name:'Synthetic project'})
    await request(owner,'POST',`/projects/${project.id}/memberships`,204,{user_id:actor,role:'member'})
    const obj=await request(owner,'POST','/objects',201,{scope:'project',project_id:project.id,object_type:'asset',title:'Synthetic attached source',body:'Synthetic only'})
    const fixture=await upload(owner,'native-revocation.md'),d={...fixture,id:obj.id},conn=new DatabaseSync(db)
    try{conn.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');conn.prepare('INSERT INTO assets VALUES(?)').run(obj.id)
      assert.equal(conn.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(obj.id,fixture.version_id,fixture.id).changes,1);conn.exec('COMMIT')
    }finally{conn.close()}
    const grant=action=>request(owner,'POST','/grants',201,{object_id:obj.id,subject_type:'user',subject_id:actor,action})
    const read=await grant('read');await grant('comment');await open(sa,d);await makeNote(sa)
    await edit(sa,'Do not restore this revoked synthetic draft');await watch(sa)
    await active(b,sb);await hidden(sa);await request(owner,'POST','/grants/revoke',204,{grant_id:read.id});await active(a,sa)
    await until(sa,`${el('status')}.textContent.includes('\u4e0d\u53ef\u8bbf\u95ee')`,'revoked reader denied')
    const returned=await state(sa);assert(Object.values(returned).every(Boolean))
    const denied=await api(host.port,who.cookie,'GET',prefix+ann(d));assert([403,404].includes(denied.status)&&!denied.json?.data)
    return {events:await pair(sa),state_after_return:returned,http_denial:denied.status}
  })
  const busy='Synthetic stale draft during pending save',third='Other tab saved revision three'
  await run('native_in_flight_stale_save',async()=>{
    await open(sa,doc);await panel(sa);await active(b,sb);await panel(sb);await active(a,sa);await panel(sa)
    await edit(sa,busy);await watch(sa);await active(b,sb);await hidden(sa);await panel(sb);await edit(sb,third)
    await click(sb,'annotation-submit');await saved(sb);await revision(doc,3,third)
    await active(a,sa);await restored(sa,busy);await watch(sa)
    const status=await pausedPatch(sa,409,async()=>{await active(b,sb);await hidden(sa)})
    await active(a,sa);await conflict(sa,busy)
    return {events:await pair(sa),draft_restored:true,patch_status:status,revision:await revision(doc,3,third)}
  })
  await run('native_in_flight_successful_save',async()=>{
    await click(sa,'annotation-rebase');await until(sa,`${rebase}.hidden&&${editor(busy)}`,'rebase retaining draft');await watch(sa)
    const status=await pausedPatch(sa,200,async()=>{await active(b,sb);await hidden(sa);await revision(doc,4,busy)})
    await active(a,sa);await until(sa,`${el('annotation-status')}.textContent==='\u5f53\u524d\u6279\u6ce8\u5df2\u5305\u542b\u63d0\u4ea4\u5185\u5bb9\u3002'`,'acknowledged pending save')
    const v=await state(sa);assert(v.draftEmpty&&v.formHidden&&!v.listEmpty)
    return {events:await pair(sa),draft_not_reopened:true,patch_status:status,revision:await revision(doc,4,busy)}
  })
  assert.deepEqual(sql(db,'PRAGMA foreign_key_check'),[]);report.status='PASS'
}catch(e){
  report.status=Object.values(report.cases).some(c=>c.status==='FAIL')?'FAIL':'NOT_RUN'
  report.error={phase,type:e.name,...(e.name==='Error'&&e.message.startsWith('timeout:')?{timeout:e.message}:{}),
    ...(e.name==='AssertionError'&&Number.isInteger(e.actual)&&Number.isInteger(e.expected)?{actual:e.actual,expected:e.expected}:{})}
}finally{
  try{
    if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++seq,method:'Browser.close'}));await sleep(350)}finally{ws.close()}}
    if(proc?.exitCode===null)proc.kill()
    if(closed)await Promise.race([closed,sleep(2500)])
    await host?.stop()
    const target=realpathSync(scratch)
    assert.equal(dirname(target),evidence);assert(basename(target).startsWith('t-native-'))
    rmSync(target,{recursive:true,force:true,maxRetries:4,retryDelay:250})
  }catch{report.cleanup='incomplete';if(report.status==='PASS')report.status='FAIL'}
  report.exit=report.status==='PASS'?0:report.status==='FAIL'?1:2
  writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify({out,exit:report.exit,cases:report.cases,error:report.error,cleanup:report.cleanup}))
  process.exitCode=report.exit
}
