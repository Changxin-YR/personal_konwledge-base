import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie,sql} from '../fnd004/harness.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'

const [candidate,entry,parent='.cache/learn004-host']=process.argv.slice(2)
const cwd=fileURLToPath(new URL('../../',import.meta.url)),self='scripts/learn004/host-recall.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'),runner=sha(readFileSync(join(cwd,self)))
assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entry,/^[a-f0-9]{64}$/)
assert.equal(runner,sha(execFileSync('git',['show',candidate+':'+self],{cwd})))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))

const terms=['AnswerHintAx','AnswerRecallBy','AnswerSeamCz','AnswerSeamDw']
const line=(n,row,tag)=>{
  const prefix=`Page ${n} Row ${String(row).padStart(2,'0')} ${tag}`
  const suffix=(n===1&&row===12)?' '+terms[0]:(n===1&&row===14)?' '+terms[1]:
    (n===1&&row===30)?' shared seam '+terms[2]:''
  const base=prefix+' '+('fixture letters for continuous selection '.repeat(2)).slice(0,75-prefix.length-1-suffix.length).trimEnd()+suffix
  return n===2&&row===1?`${terms[3]} shared seam ${base.slice(0,49)}`:base
}
const textFor=(n,tag)=>Array.from({length:30},(_,i)=>line(n,i+1,tag)).join('\n')
function pdf(tag){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>']
  for(let n=1;n<=3;n++){
    const stream=`BT /F1 11 Tf 16 TL 30 650 Td ${textFor(n,tag).split('\n').map(t=>'('+t+') Tj').join(' T* ')} ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 700] /Resources << /Font << /F1 3 0 R >> >> /Contents ${3+2*n} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let body='%PDF-1.4\n';const xref=['0000000000 65535 f ']
  for(const [i,o] of objects.entries()){xref.push(String(body.length).padStart(10,'0')+' 00000 n ');body+=`${i+1} 0 obj\n${o}\nendobj\n`}
  return Buffer.from(body+`xref\n0 ${xref.length}\n${xref.join('\n')}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`,'ascii')
}
const old=[1,2,3].map(n=>textFor(n,'oldsource')), hashes=old.map(sha)
const begin=old[0].indexOf('Page 1 Row 10 ')+5,end=old[2].indexOf('Page 3 Row 21 ')+10
const expected=[[1,begin,old[0].length,hashes[0]],[2,0,old[1].length,hashes[1]],[3,0,end,hashes[2]]]
const defTerms=terms.map((term,i)=>old[i===3?1:0].indexOf(term))
assert(defTerms.every(n=>n>=0));assert(expected.reduce((n,p)=>n+p[2]-p[1],0)>5000)
const facts={candidate_sha:candidate,entry_sha256:entry,runner_sha256:runner,node:process.version,status:'NOT_RUN',T01:'NOT_RUN',T02:'NOT_RUN',P04:'NOT_RUN',checks:[],shots:[],boots:[]}
let h,browser,phase='binding'
const pass=(id,details)=>facts.checks.push({id,status:'PASS',details})
const prefix='/knowledge/v1',marker={'x-knowledgeos-request':'1'},recall='/recall',password=randomUUID()
const pathOf=d=>`/assets/${d.id}/versions/${d.version_id}`
const rows=(q,args=[])=>sql(dbPath(h.data),q,args)
const verdict=page=>page.locator('#status')
async function request(ctx,path,code,{method='GET',headers={},data}={}){
  const r=await ctx.request.fetch(h.base+prefix+path,{method,maxRedirects:0,headers:{...marker,...headers},data})
  assert.equal(r.status(),code,method+' '+path+(r.status()===code?'':' '+(await r.text()).slice(0,200)))
  if(path.startsWith(recall))assert.equal(r.headers()['cache-control'],'no-store')
  if(code===204)return
  const body=await r.json();if(code>=400){assert.equal(body.data,undefined);return body.code}return body.data
}
const post=(ctx,path,data,code=201,key=randomUUID())=>request(ctx,path,code,{method:'POST',data,headers:{'idempotency-key':key}})
const patch=(ctx,path,data,code=200,key=randomUUID())=>request(ctx,path,code,{method:'PATCH',data,headers:{'idempotency-key':key}})
async function login(name,viewport){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();await page.goto(h.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  return {ctx,page,user:(await request(ctx,'/me',200)).id}
}
async function upload(ctx,tag,prev){
  const bytes=pdf(tag),doc=await request(ctx,'/imports',201,{method:'POST',headers:{'content-type':'application/pdf','x-knowledgeos-filename':'recall.pdf',
    'idempotency-key':randomUUID(),...(prev?{'x-knowledgeos-asset-id':prev.id,'x-knowledgeos-expected-version':'1'}:{})},data:bytes})
  assert.equal(doc.sha256,sha(bytes));return doc
}
async function parse(ctx,doc){
  const path=pathOf(doc)+'/parse';await request(ctx,path+'/start',202,{method:'POST'})
  return until(async()=>{const p=await request(ctx,path,200);return ['complete','partial'].includes(p.state)&&p},'PDF extraction',60_000)
}
async function screen(page,name){const b=await page.screenshot({path:join(out,name+'.png')});facts.shots.push({name,sha256:sha(b)})}
async function drag(page,startPage,start,endPage,end){
  // A DOM Range measures glyph positions only; mouse events create the actual selection.
  const coords=await page.evaluate(args=>args.map(([n,o])=>{
    const node=document.querySelector('pre[data-ordinal="'+n+'"]').firstChild,r=document.createRange()
    r.setStart(node,o);r.setEnd(node,o);const rect=r.getBoundingClientRect()
    return [rect.left+.04,rect.top+rect.height/2]
  }),[[startPage,start],[endPage,end]])
  assert(coords.every(([x,y])=>x>0&&y>0&&y<page.viewportSize().height),'both glyphs must be visible to drag')
  await page.mouse.move(...coords[0]);await page.mouse.down();await page.mouse.move(...coords[1],{steps:24});await page.mouse.up()
  const offsets=await page.evaluate(()=>{
    const r=getSelection().getRangeAt(0);return [Number(r.startContainer.parentElement.dataset.ordinal),r.startOffset,Number(r.endContainer.parentElement.dataset.ordinal),r.endOffset]
  })
  assert.deepEqual(offsets,[startPage,start,endPage,end]);return offsets
}
const hidden=(s,exclude=[])=>{for(const word of terms){if(!exclude.includes(word))assert(!s.includes(word),'unrevealed answer found in projected data or DOM')}}
async function clickSaved(page,name){
  const [r]=await Promise.all([page.waitForResponse(r=>r.url().includes(prefix+recall+'/')&&r.request().method()==='PATCH'),page.getByRole('button',{name,exact:true}).click()])
  assert.equal(r.status(),200);assert.equal(r.headers()['cache-control'],'no-store');await verdict(page).filter({hasText:'进度已保存'}).waitFor()
  return (await r.json()).data
}
const launch=async()=>{const {chromium}=await import(pathToFileURL(h.playwright));browser=await chromium.launch({channel:'chrome',args:['--disable-background-networking']});facts.chrome=browser.version()}
const goPractice=(page,id)=>page.goto(h.base+'/knowledgeos/recall?material='+id)
try{
  h=await isolate(candidate,entry);facts.binding=h.facts
  const boot=await h.start(),cookie=await entryCookie(boot.entry);facts.boots.push(boot.pid)
  assert.equal((await api(h.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})).status,201)
  assert.equal((await api(h.port,'','POST',prefix+'/auth/register',{login_name:'peer',display_name:'Peer',password})).status,201)
  await launch();const owner=await login('owner',{width:1280,height:3000}),peer=await login('peer'),{ctx,page,user}=owner
  phase='PDF source and actual mouse drags';const doc=await upload(ctx,'oldsource')
  const parsed=await parse(ctx,doc);assert.equal(parsed.state,'complete');assert.equal(parsed.total,3)
  const byPage=await request(ctx,pathOf(doc)+'/pages?from=1&limit=3',200);assert.deepEqual(byPage.pages.map(p=>p.text),old)
  await page.goto(h.base+'/knowledgeos/reader?'+new URLSearchParams({asset:doc.id,version:doc.version_id,unit:'1'}))
  await page.getByRole('link',{name:'制作遮挡练习'}).click();await page.locator('#pages pre').first().waitFor()
  for(const n of [2,3]){await page.getByRole('button',{name:'加载下一页'}).click();await page.locator(`pre[data-ordinal="${n}"]`).waitFor()}
  const selection=await drag(page,1,begin,3,end);await screen(page,'mouse-across-three-pages')
  await page.getByRole('button',{name:'设为练习范围'}).click()
  for(const i of [0,1,2]){
    const n=defTerms[i],paired=i===2
    await drag(page,1,n,paired?2:1,paired?terms[3].length:n+terms[i].length)
    await page.getByRole('button',{name:'添加为遮挡组'}).click()
    await verdict(page).filter({hasText:'已添加遮挡组 '+(i+1)}).waitFor()
  }
  await page.locator('#title').fill('Independent three-page practice')
  const [created]=await Promise.all([page.waitForResponse(r=>r.url()===h.base+prefix+recall&&r.request().method()==='POST'),page.getByRole('button',{name:'保存并练习'}).click()])
  assert.equal(created.status(),201);assert.equal(created.headers()['cache-control'],'no-store');const bytes=await created.text();hidden(bytes)
  const payload=created.request().postDataJSON(),{material:m}=JSON.parse(bytes).data,id=m.id,path=recall+'/'+id
  assert.deepEqual(payload.interior_hashes,[hashes[1]]);await page.locator('#practice').waitFor();assert.equal(await page.locator('#pages').textContent(),'');hidden(await page.locator('main').innerHTML())
  assert.deepEqual(rows('SELECT ordinal,start,end,source_hash FROM recall_segments WHERE material_id=? ORDER BY ordinal',[id]).map(r=>Object.values(r)),expected)
  const maskRows=()=>rows('SELECT ordinal,start,end,mask_group FROM recall_masks WHERE material_id=? ORDER BY ordinal,start',[id]).map(r=>Object.values(r))
  const masks=[[1,defTerms[0],defTerms[0]+terms[0].length,1],[1,defTerms[1],defTerms[1]+terms[1].length,2],
    [1,defTerms[2],old[0].length,3],[2,0,terms[3].length,3]]
  assert.deepEqual(maskRows(),masks)
  assert.equal(await post(ctx,recall,{...payload,interior_hashes:['0'.repeat(64)]},409),'RECALL_SOURCE_CHANGED')
  assert.equal(rows('SELECT count(*) n FROM recall_materials')[0].n,1)
  assert.equal(await request(peer.ctx,path,404),'RECALL_NOT_FOUND');assert.equal(await request(peer.ctx,recall+'/'+randomUUID(),404),'RECALL_NOT_FOUND')
  const anonymous=await browser.newContext();assert.equal(await request(anonymous,path,401),'AUTH_REQUIRED');await anonymous.close()
  assert.deepEqual(await page.evaluate(async()=>[await caches.keys(),localStorage.length,sessionStorage.length]),[[],0,0])
  pass('MOUSE_UTF16_MASKS_AND_REDACTION',{selection,segments:expected,masked_segments:masks,no_cache:true,stale_interior_rejected:true,guessed_id_rejected:true})
  facts.T01='PASS';await screen(page,'practice-before-reveal')
  phase='separate progress and optimistic concurrency'
  const hinted=await clickSaved(page,'提示 1');hidden(JSON.stringify(hinted));assert.deepEqual(hinted.progress.hints,[{group:1,count:1}])
  assert.equal(await patch(ctx,path,{actor_id:user,event:'recall',value:1,expected_revision:hinted.revision},409),'RECALL_NOT_INDEPENDENT')
  const recalled=await clickSaved(page,'独立回忆 2');assert.deepEqual(recalled.progress.independent_recall,[2]);hidden(JSON.stringify(recalled))
  const revealed=await clickSaved(page,'揭示 3');assert(revealed.runs.some(p=>p.text?.includes(terms[2])));hidden(JSON.stringify(revealed),[terms[2]])
  await page.locator('#rating').selectOption('4');const rated=await clickSaved(page,'保存自评');assert.equal(rated.progress.self_rating,4)
  const moved=await clickSaved(page,'下一练习页');assert.equal(moved.ordinal,2);assert(moved.runs.some(p=>p.text?.includes(terms[3])));assert.equal(moved.length,old[1].length)
  const req1={actor_id:user,event:'rating',value:4,expected_revision:moved.revision},req2={...req1,value:5}
  const run=(body,key)=>ctx.request.patch(h.base+prefix+path,{headers:{...marker,'idempotency-key':key},data:body})
  const pair=[{key:randomUUID(),body:req1},{key:randomUUID(),body:req2}]
  const rr=await Promise.all(pair.map(({key,body})=>run(body,key)));assert.deepEqual(rr.map(r=>r.status()).sort(),[200,409])
  const win=rr.findIndex(r=>r.status()===200),loser=1-win,saved=(await rr[win].json()).data
  assert.equal((await rr[loser].json()).code,'REVISION_CONFLICT')
  assert.deepEqual(await patch(ctx,path,pair[win].body,200,pair[win].key),saved)
  assert.equal(await patch(ctx,path,pair[loser].body,409,pair[win].key),'IDEMPOTENCY_CONFLICT')
  assert.equal(rows('SELECT count(*) n FROM recall_events WHERE material_id=?',[id])[0].n,6)

  phase='restart and publish replacement';await browser.close();browser=null;await h.stop()
  facts.boots.push((await h.start()).pid);await launch();const resumed=await login('owner',{width:430,height:850})
  const fresh=await upload(resumed.ctx,'newsource',doc);assert.equal(fresh.id,doc.id);assert.notEqual(fresh.version_id,doc.version_id)
  assert.equal((await parse(resumed.ctx,fresh)).state,'complete');assert.deepEqual((await request(resumed.ctx,pathOf(fresh)+'/pages?from=1&limit=3',200)).pages.map(p=>p.text),[1,2,3].map(n=>textFor(n,'newsource')))
  const restored=await request(resumed.ctx,path,200);assert(restored.source_changed);assert.equal(restored.material.version_id,doc.version_id)
  assert.deepEqual(restored.progress,saved.progress);assert.deepEqual(restored.runs,saved.runs);assert.equal(restored.ordinal,2);assert.equal(restored.revision,saved.revision)
  await resumed.page.goto(h.base+'/knowledgeos/library');await resumed.page.getByRole('link',{name:'遮挡背诵'}).click();await resumed.page.getByRole('link',{name:'Independent three-page practice'}).click();await resumed.page.locator('#version-warning').waitFor()
  assert.match(await resumed.page.locator('#practice-meta').textContent(),/2 \/ 3/);assert.equal(await resumed.page.locator('#rating').inputValue(),String(saved.progress.self_rating))
  const practiceMarkup=await resumed.page.locator('main').innerHTML();hidden(practiceMarkup,[terms[3]]);assert(!practiceMarkup.includes('newsource'))
  assert.deepEqual(maskRows(),masks);await screen(resumed.page,'resumed-old-version-mobile')
  pass('RESTART_AND_REPLACEMENT',{original:doc.sha256,replacement:fresh.sha256,ordinal:2,progress:restored.progress,conflict_and_idempotency:true})

  phase='real grant revocation with private exercise';const other=await login('peer'),project=await post(resumed.ctx,'/projects',{name:'Recall ACL project'})
  await post(resumed.ctx,`/projects/${project.id}/memberships`,{user_id:other.user,role:'member'},204)
  const access=await post(resumed.ctx,'/objects',{scope:'project',project_id:project.id,object_type:'asset',title:'Revocable source',body:'Isolated asset binding'})
  const text='Access before revocation only.'
  const imported=await request(resumed.ctx,'/imports',201,{method:'POST',headers:{'content-type':'text/plain','idempotency-key':randomUUID(),'x-knowledgeos-filename':'fixture.txt'},data:Buffer.from(text)})
  const db=new DatabaseSync(dbPath(h.data));try{
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');db.prepare('INSERT INTO assets VALUES(?)').run(access.id)
    assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(access.id,imported.version_id,imported.id).changes,1);db.exec('COMMIT')
  }finally{db.close()}
  const limited={asset_id:access.id,version_id:imported.version_id},src=recall+'/source?'+new URLSearchParams({...limited,ordinal:'1'})
  await request(other.ctx,src,404);const grant=await post(resumed.ctx,'/grants',{object_id:access.id,subject_type:'user',subject_id:other.user,action:'read'})
  assert.equal((await request(other.ctx,src,200)).text,text)
  const endpoint=offset=>({ordinal:1,offset,source_hash:sha(text)})
  const practice=await post(other.ctx,recall,{actor_id:other.user,...limited,title:'From shared input',first:endpoint(0),last:endpoint(text.length),interior_hashes:[],masks:[{ordinal:1,start:0,end:6,group:1}]})
  const shared=recall+'/'+practice.material.id
  await request(resumed.ctx,shared,404);await goPractice(other.page,practice.material.id);await other.page.locator('#practice').waitFor()
  await post(resumed.ctx,'/grants/revoke',{grant_id:grant.id},204)
  await request(other.ctx,src,404);await request(other.ctx,shared,404);await patch(other.ctx,shared,{actor_id:other.user,event:'reveal',value:1,expected_revision:1},404)
  assert.deepEqual((await request(other.ctx,recall,200)).items,[])
  await other.page.locator('#practice').waitFor({state:'hidden',timeout:15000});assert.equal(await other.page.locator('#practice-text').textContent(),'')
  assert.equal(rows('SELECT count(*) n FROM recall_events WHERE material_id=?',[practice.material.id])[0].n,0)
  assert.deepEqual(rows('PRAGMA foreign_key_check'),[])
  pass('REAL_REVOCATION',{fixture:'project source binding only',source_and_practice_denied:true,failed_write_has_no_event:true,dom_cleared:true})
  facts.T02='PASS';facts.P04='PASS';facts.status='PASS'
}catch(e){facts.status='FAIL';facts.phase=phase;facts.error=String(e.stack);console.error(e);process.exitCode=1}
finally{
  try{await browser?.close()}finally{
    try{await h?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(out)}
  }
}
