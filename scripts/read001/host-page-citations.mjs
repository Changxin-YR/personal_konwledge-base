// Real DSH Host; hold only the third parser reply, fault only the fourth. Rendering is never stubbed.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {knownPdf,textFor} from '../lib002/a07-known-pdf.mjs'
import {acceptanceSamples} from '../lib004/acceptance-samples.mjs'
import {api,dbPath,entryCookie,login,sql} from '../fnd004/harness.mjs'

const [candidate,entry,parent=tmpdir()]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex')
assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entry,/^[a-f0-9]{64}$/)
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root});assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
const helpers={};for(const f of ['scripts/read001/host-page-citations.mjs','scripts/lib004/acceptance-samples.mjs']){helpers[f]=sha(readFileSync(join(root,f)));assert.equal(helpers[f],sha(git('show',candidate+':'+f)))}
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'read001-pages-')),report={candidate_sha:candidate,entry_sha256:entry,helpers,status:'NOT_RUN',steps:[]}
let h,user,phase='bind';const prefix='/knowledge/v1',password=randomUUID(),word='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const send=async(path,status,body,headers={})=>{const r=await fetch(h.base+prefix+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{cookie:user,'x-knowledgeos-request':'1',...headers},body});assert.equal(r.status,status);const j=await r.json();if(status>=400){assert(!('data' in j));return j.code}return j.data}
const post=(path,status,obj,key=randomUUID())=>send(path,status,JSON.stringify(obj),{'content-type':'application/json','idempotency-key':key})
const upload=(name,media,b)=>send('/imports',201,b,{'content-type':media,'idempotency-key':randomUUID(),'x-knowledgeos-filename':name})
const base=r=>`/assets/${r.id}/versions/${r.version_id}`,page=(r,n,cid)=>send(base(r)+'/reader?unit='+n+(cid?'&conversion='+cid:''),200)
const step=(name,facts)=>report.steps.push({name,...facts})
function image(p,label,token){
  assert.match(p.image,/^data:image\/png;base64,/);const bytes=Buffer.from(p.image.split(',')[1],'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),p.width);assert.equal(bytes.readUInt32BE(20),p.height);assert(p.width>1&&p.height>1)
  assert.equal(p.anchor,sha(p.text));const start=p.text.indexOf(token);assert(start>=0);const end=start+token.length
  const boxes=p.boxes.filter(b=>b.start<end&&b.end>start);assert(boxes.length>0);for(const b of boxes){assert(b.end>b.start&&b.start>=0&&b.end<=p.text.length);assert(b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=p.width+1&&b.y+b.height<=p.height+1)}
  writeFileSync(join(out,label+'.png'),bytes);step(label,{sha256:sha(bytes),width:p.width,height:p.height,selected_box_count:boxes.length,start,end});return {asset_id:p.asset_id,version_id:p.version_id,ordinal:p.ordinal,start,end,source_hash:p.anchor,...(p.conversion_id?{conversion_id:p.conversion_id}:{})}
}
try{
  h=await isolate(candidate,entry);const first=await h.start(['hold3','fail4']);const admin=(await entryCookie(first.entry)).cookie
  for(const [endpoint,who,name] of [['bootstrap',admin,'setup'],['register','','reader']])assert.equal((await api(h.port,who,'POST',prefix+'/auth/'+endpoint,{login_name:name,display_name:name,password})).status,201)
  const authenticate=async()=>{const r=await login(h.port,'reader',password);assert.equal(r.response.status,200);return r.cookie};user=await authenticate()
  phase='partial PDF';const r=await upload('chapter.pdf','application/pdf',knownPdf('reader'))
  assert.equal((await page(r,1)).state,'idle');await post('/assets/'+r.id+'/process',202,{version_id:r.version_id});await until(()=>h.events().some(e=>e.event==='held'&&e.page===3),'held parser reply',45000)
  const good=await page(r,2);assert.equal(good.text,textFor('reader',2));assert.equal(good.total,6);assert.equal(good.chapter,'First unit');const sel=image(good,'pdf-original','reader'),pdfCitation=await post('/citations',201,sel)
  const saved=pdfCitation.locator.geometry;assert.equal(saved.page,2);assert.equal(saved.source_sha256,r.sha256);assert.deepEqual([saved.width,saved.height],[good.width,good.height]);assert.deepEqual(saved.boxes,good.boxes.filter(b=>b.start<sel.end&&b.end>sel.start));assert(saved.boxes.length>0)
  const snapshot=sql(dbPath(h.data),'SELECT snapshot FROM citation_locators WHERE citation_id=?',[pdfCitation.id]);assert.deepEqual(JSON.parse(snapshot[0].snapshot),pdfCitation.locator)
  const pending=await page(r,3);assert.equal(pending.state,'pending');assert.equal(pending.text,'');assert(!('image' in pending));assert.equal(await post('/citations',409,{...sel,ordinal:3}),'SOURCE_NOT_READY');h.release()
  const db=dbPath(h.data);await until(()=>sql(db,'SELECT state FROM pdf_parse_runs WHERE version_id=?',[r.version_id])[0]?.state==='partial','page failure',45000)
  const failed=await page(r,4);assert.equal(failed.state,'failed');assert(!('image' in failed));const blank=await page(r,5);assert.equal(blank.state,'review');assert.equal(blank.text,'');assert.equal(blank.boxes.length,0)
  phase='historical Office conversion';const source=await upload('review.docx',word,acceptanceSamples()['a08-v1.docx']);const office=base(source)+'/office';const before=await page(source,1);assert.equal(before.state,'unconverted')
  const convert=async()=>{const job=await post(office+'/start',202,{});await until(()=>{const c=sql(db,'SELECT state FROM office_conversions WHERE id=?',[job.id])[0];assert(c&&!['failed','cancelled','superseded'].includes(c.state));return c.state==='ready'},'conversion',180000);return job.id}
  const c1=await convert(),w=await page(source,1,c1);assert.equal(w.kind,'office');assert.equal(w.conversion_id,c1);const ws=image(w,'word-original','Quartz'),wc=await post('/citations',201,ws)
  const context=wc.locator.context;assert(context.block_start<=ws.start&&ws.end<=context.block_end);assert.equal(context.block_id,sha(JSON.stringify([source.version_id,c1,1,context.block_start,context.block_end])));assert.equal(context.before_hash,sha(w.text.slice(Math.max(0,ws.start-64),ws.start)));assert.equal(context.after_hash,sha(w.text.slice(ws.end,ws.end+64)))
  assert.deepEqual(JSON.parse(sql(db,'SELECT snapshot FROM citation_locators WHERE citation_id=?',[wc.id])[0].snapshot),wc.locator)
  const c2=await convert();assert.notEqual(c2,c1);assert.equal((await page(source,1)).conversion_id,c2);const old=await send('/citations/'+wc.id+'/resolve',200);assert.equal(old.conversion_id,c1);assert.equal(old.quote,'Quartz')
  phase='restart and retry failed page';await h.stop();const second=await h.start();user=await authenticate();assert.notEqual(second.pid,first.pid)
  const restored=await send('/citations/'+pdfCitation.id+'/resolve',200);assert.equal(restored.quote,'reader');assert.deepEqual(restored.locator.geometry,saved);assert.deepEqual(await send('/citations/'+wc.id+'/resolve',200),old)
  await post('/assets/'+r.id+'/process',202,{version_id:r.version_id,page:4});await until(()=>sql(db,'SELECT state FROM pdf_pages WHERE version_id=? AND page=4',[r.version_id])[0]?.state==='ready','single page retry',45000)
  assert.equal((await page(r,4)).text,textFor('reader',4));step(phase,{before:'failed',after:'ready',pdf_version:r.version_id,office_version:source.version_id,original_conversion:c1,new_conversion:c2});report.status='PASS'
}catch(e){report.status='FAIL';report.failure={phase,type:e.name,line:String(e.stack).match(/host-page-citations\.mjs:\d+/)?.[0]};process.exitCode=1}
finally{try{await h?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??'',out)}}
