// Real Chrome and product HTML. All business responses below are explicit fixtures, not a real Host or ZIP parser.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {after,before,test} from 'node:test'
import {pathToFileURL} from 'node:url'
import {buildLibraryHtml} from '../../packages/knowledgeos-panel/src/host/library-page.ts'

const {chromium}=await import(pathToFileURL(resolve(process.env.KO_TEST_CACHE??'.cache','panel-builder/node_modules/playwright/index.mjs')))
let browser
before(async()=>{browser=await chromium.launch({channel:'chrome',headless:true})})
after(async()=>{await browser?.close()})
const base='/knowledge/v1/',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const uploadBytes=Buffer.from([80,75,3,4,0,255,42]),title='私人混合.ZIP'
const member=(name,path,media_type,reason=null)=>({id:randomUUID(),name,path,media_type,reason,size:42,compressed_size:21,state:'available'})
const manifest=()=>({id:randomUUID(),title,state:'staged',sha256:'a'.repeat(64),byte_length:uploadBytes.length,entries:[
  member('目录\\指南.pdf','目录/指南.pdf','application/pdf'),member('note.md','note.md','text/markdown'),
  member('letter.docx','letter.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  member('extra.bin','extra.bin',null,'UNSUPPORTED_TYPE'),member('<b>readme</b>.txt','nested/<b>readme</b>.txt','text/plain')]})
function publish(e){e.state='imported';delete e.error;e.receipt={id:randomUUID(),version_id:randomUUID(),title:e.path,version:1,sha256:'b'.repeat(64),byte_length:e.size,media_type:e.media_type}}
async function fixture(t){
  const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage();page.setDefaultTimeout(5000)
  const peer={owner:'alice',archive:manifest(),staged:false,uploads:[],selections:[],errors:[],detail:null,select:null}
  t.after(async()=>{await ctx.close();assert.deepEqual(peer.errors,[])})
  page.on('pageerror',e=>peer.errors.push(e.message))
  await ctx.route('http://localhost/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method(),h=req.headers(),d=peer.archive
    const reply=(data,status=200)=>route.fulfill({status,json:{data}})
    try{
      if(path==='/knowledgeos/library')return await route.fulfill({contentType:'text/html; charset=utf-8',body:buildLibraryHtml()})
      if(path===base+'me')return await reply({id:peer.owner})
      if(path===base+'assets')return await reply({items:peer.owner==='alice'?d.entries.filter(e=>e.receipt).map(e=>e.receipt):[]})
      if(path===base+'imports'&&method==='GET')return await reply({items:peer.staged&&peer.owner==='alice'?[{id:d.id,title:d.title,state:d.state,sha256:d.sha256}]:[]})
      assert.equal(peer.owner,'alice')
      if(method==='POST'){assert.equal(h['x-knowledgeos-request'],'1');assert.match(h['idempotency-key'],uuid)}
      if(path===base+'imports'&&method==='POST'){
        assert.equal(h['content-type'],'application/zip');assert.equal(decodeURIComponent(h['x-knowledgeos-filename']),title)
        assert.deepEqual(req.postDataBuffer(),uploadBytes);assert.ok(!('x-knowledgeos-asset-id' in h));assert.ok(!('x-knowledgeos-expected-version' in h))
        peer.uploads.push(h['idempotency-key']);peer.staged=true;return await reply(d,201)
      }
      assert(peer.staged)
      if(path===base+'imports/'+d.id+'/entries'&&method==='GET')return await (peer.detail?peer.detail(route,reply):reply(d))
      assert.equal(path,base+'imports/'+d.id+'/selection');assert.equal(method,'POST');assert.equal(h['content-type'],'application/json')
      const body=req.postDataJSON();assert.deepEqual(Object.keys(body),['entry_ids']);const ids=body.entry_ids
      assert(ids.length&&ids.every(id=>uuid.test(id)&&d.entries.some(e=>e.id===id&&!e.reason)));assert.equal(new Set(ids).size,ids.length)
      peer.selections.push({key:h['idempotency-key'],ids});assert.ok(peer.select);await peer.select(route,reply,ids)
    }catch(e){peer.errors.push(e.message);await route.abort().catch(()=>{})}
  })
  const mode=page.getByLabel('导入格式'),resume=page.getByLabel('继续处理压缩包'),button=name=>page.getByRole('button',{name,exact:true})
  async function zip(){await mode.selectOption('zip');await page.locator('#zip-status').filter({hasText:peer.staged&&peer.owner==='alice'?'请选择要继续':'暂无压缩包'}).waitFor()}
  async function upload(){await zip();await page.getByLabel('ZIP 文件').setInputFiles({name:title,mimeType:'application/octet-stream',buffer:uploadBytes});await button('预览压缩包').click();await page.locator('#zip-panel').waitFor()}
  async function reload(){await page.reload();await page.getByText('资料已刷新。',{exact:true}).waitFor();await zip();await resume.selectOption(peer.archive.id);await page.locator('#zip-panel').waitFor()}
  await page.goto('http://localhost/knowledgeos/library');await page.getByText('资料已刷新。',{exact:true}).waitFor()
  return {page,peer,button,mode,resume,zip,upload,reload,box:e=>page.getByRole('checkbox',{name:e.path,exact:true})}
}

test('ZIP preview never publishes; selective partial import, per-member receipts, reload and retry',async t=>{
  const {page,peer,button,box,upload,reload}=await fixture(t),d=peer.archive,[pdf,md,word,blocked,literal]=d.entries
  await upload();assert.equal(peer.uploads.length,1);assert.equal(peer.selections.length,0);assert.equal(await page.locator('#list .entry').count(),0)
  assert.equal(await page.getByLabel('导入到').isVisible(),false);assert.equal(await button('导入所选文件').isEnabled(),false)
  assert.equal(await box(blocked).isEnabled(),false);await page.getByText('不可导入：UNSUPPORTED_TYPE').waitFor();await box(literal).waitFor();assert.equal(await page.locator('#zip-entries b').count(),0)
  assert.match(await page.locator('#zip-entries').innerText(),/目录\\指南\.pdf · 42 字节（压缩后 21 字节）/)
  await box(pdf).check();await box(md).check();assert.equal(await box(word).isChecked(),false)
  peer.select=async(_,reply,ids)=>{assert.deepEqual(ids,[md.id,pdf.id].sort());publish(pdf);md.state='failed';md.error='TEXT_INVALID_ENCODING';d.state='partial';await reply(d)}
  await button('导入所选文件').click();await page.getByText('导入失败：TEXT_INVALID_ENCODING').waitFor();assert.equal(await box(pdf).isEnabled(),false);assert.equal(await box(md).isChecked(),true)
  assert.equal(await page.locator('#list .entry').count(),1);const first=pdf.receipt.version_id
  await reload();assert.equal(await box(pdf).isEnabled(),false);await box(md).check()
  peer.select=async(_,reply,ids)=>{assert.deepEqual(ids,[md.id]);publish(md);d.state='imported';await reply(d)}
  await button('导入所选文件').click();await page.locator('#zip-status').filter({hasText:'已导入 2 · 失败 0'}).waitFor()
  assert.equal(pdf.receipt.version_id,first);assert.notEqual(md.receipt.id,pdf.receipt.id);assert.notEqual(peer.selections[0].key,peer.selections[1].key)
  for(const e of [md,pdf]){const link=page.locator('#zip-entries li').filter({has:box(e)}).getByRole('link').last();assert.equal(await link.getAttribute('href'),base+'assets/'+e.receipt.id+'/versions/'+e.receipt.version_id+'/original?download=1')}
  assert.equal(await page.locator('#list .entry').count(),2);assert.equal(await box(word).isEnabled(),true);assert.equal(peer.uploads.length,1)
})

test('lost selection response replays identical UUID key and entry IDs without creating another result',async t=>{
  const {peer,page,button,box,upload}=await fixture(t),d=peer.archive,[pdf]=d.entries
  await upload();await box(pdf).check();let publications=0
  peer.select=async(route,reply)=>{if(!publications){publish(pdf);publications++;return route.abort('connectionreset')}assert.deepEqual(peer.selections[0],peer.selections[1]);await reply(d)}
  await button('导入所选文件').click();await page.getByText(/未确认导入结果/).waitFor();assert.equal(await box(pdf).isEnabled(),false)
  await button('重试上次提交').click();await page.locator('#zip-status').filter({hasText:'已导入 1'}).waitFor();assert.equal(publications,1);assert.equal(await page.locator('#list .entry').count(),1)
})

test('resume an interrupted selection on a narrow screen; pending members are actionable without resending successes',async t=>{
  const {peer,page,button,box,zip,resume}=await fixture(t),d=peer.archive,[done,pending,untouched]=d.entries
  publish(done);pending.state='selected';d.state='selected';peer.staged=true
  await page.setViewportSize({width:375,height:800});await zip();await resume.selectOption(d.id);await page.locator('#zip-panel').waitFor()
  assert.equal(await box(done).isEnabled(),false);assert.equal(await box(pending).isChecked(),true);assert.equal(await box(untouched).isChecked(),false)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  const entered=Promise.withResolvers(),release=Promise.withResolvers();t.after(()=>release.resolve())
  peer.select=async(_,reply,ids)=>{assert.deepEqual(ids,[pending.id]);entered.resolve();await release.promise;publish(pending);await reply(d)}
  await button('导入所选文件').click();await entered.promise
  await page.getByText('正在导入 1 项…',{exact:true}).waitFor();assert.equal(await page.locator('#zip-commit').isEnabled(),false)
  release.resolve();await page.locator('#zip-status').filter({hasText:'已导入 2'}).waitFor();assert.equal(peer.uploads.length,0);assert.equal(peer.selections.length,1)
})

test('delayed manifest from previous account cannot reappear after the principal changes',async t=>{
  const {peer,page,zip,resume}=await fixture(t),entered=Promise.withResolvers(),release=Promise.withResolvers();t.after(()=>release.resolve())
  peer.staged=true;peer.detail=async(_,reply)=>{entered.resolve();await release.promise;await reply(peer.archive)}
  await zip();await resume.selectOption(peer.archive.id);await entered.promise;peer.owner='bob';release.resolve()
  await page.getByText('bob',{exact:true}).waitFor();await page.getByText('资料已刷新。',{exact:true}).waitFor();assert.equal(await page.locator('#zip-panel').isVisible(),false)
  assert.doesNotMatch(await page.locator('body').textContent(),/私人混合|指南\.pdf|alice/);await zip();assert.equal(await resume.locator('option').count(),1)
})

test('late manifest after deselection cannot replace the archive list with old entries',async t=>{
  const {peer,page,zip,resume}=await fixture(t),entered=Promise.withResolvers(),release=Promise.withResolvers();t.after(()=>release.resolve())
  peer.staged=true;peer.detail=async(_,reply)=>{entered.resolve();await release.promise;await reply(peer.archive)}
  await zip();await resume.selectOption(peer.archive.id);await entered.promise;await resume.selectOption('');await page.getByText('请选择要继续处理的压缩包。').waitFor()
  const late=page.waitForResponse(r=>r.url().endsWith('/entries'));release.resolve();await (await late).finished();assert.equal(await page.locator('#zip-panel').isVisible(),false)
  assert.equal(await page.locator('#zip-entries li').count(),0);assert.equal(peer.selections.length,0)
})

for(const denied of [401,403,404])test(`selection denial ${denied} clears private manifest, receipt and file`,async t=>{
  const {peer,page,button,upload,box}=await fixture(t);await upload();await box(peer.archive.entries[0]).check()
  peer.select=route=>route.fulfill({status:denied,json:{code:'DENIED'}});await button('导入所选文件').click();await page.locator('#status').filter({hasText:denied===401?'请先登录':'资料不可访问'}).waitFor()
  assert.doesNotMatch(await page.locator('body').textContent(),/私人混合|指南\.pdf|alice/);assert.equal(await page.locator('#file').inputValue(),'');assert.equal(await page.locator('#zip').isVisible(),false)
})
