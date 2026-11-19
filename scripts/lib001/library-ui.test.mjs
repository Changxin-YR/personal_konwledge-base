// Chrome drives the real page against a synthetic, cookie-scoped HTTP peer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildLibraryHtml } from '../../packages/knowledgeos-panel/src/host/library-page.ts'

const pw = resolve(process.env.KO_TEST_CACHE ?? '.cache', 'panel-builder/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(pw).href)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
// A one-page PDF, including a non-UTF8 comment to expose text transcoding.
function pdf(tag) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>']
  let text='%PDF-1.4\n%\xff'+tag+'\n'; const offsets=['0000000000 65535 f ']
  objects.forEach((obj,i)=>{ offsets.push(String(text.length).padStart(10,'0')+' 00000 n '); text+=`${i+1} 0 obj\n${obj}\nendobj\n` })
  return Buffer.from(text+`xref\n0 4\n${offsets.join('\n')}\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${text.length}\n%%EOF\n`, 'latin1')
}

async function fixture(t) {
  const f = { posts:[], reads:[], originals:new Map(), current:new Map(), receipts:new Map(), errors:[] }
  const srv = createServer(async (req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
    const ok=data=>send(200,{data}), fail=(status,code)=>send(status,{code,message:'fixture path C:\\private\\original.pdf'})
    try {
      if(req.url==='/knowledgeos/library'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(buildLibraryHtml())}
      if(req.url==='/favicon.ico'){res.writeHead(204);return res.end()}
      const user=/session=(alice|bob)\b/.exec(req.headers.cookie??'')?.[1]
      if(!user)return fail(401,'SESSION_REQUIRED')
      if(req.url==='/knowledge/v1/me')return ok({id:user,display_name:user,login_name:user})
      if(req.url==='/knowledge/v1/assets')return ok({items:[...f.current.values()].filter(x=>x.user===user).map(x=>x.row)})
      if(req.method==='POST'&&req.url==='/knowledge/v1/imports'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk)
        const bytes=Buffer.concat(chunks),h=req.headers,key=h['idempotency-key'],id=h['x-knowledgeos-asset-id']??randomUUID()
        f.posts.push({user,h,bytes});assert.match(key,uuid);assert.equal(h['content-type'],'application/pdf');assert.equal(h['x-knowledgeos-request'],'1')
        if(f.receipts.has(user+key))return ok(f.receipts.get(user+key))
        if(f.reject)return fail(f.reject,f.reject===409?'VERSION_CONFLICT':'IMPORT_FAILED')
        const row={id,title:decodeURIComponent(h['x-knowledgeos-filename']),version_id:randomUUID(),version:(f.current.get(id)?.row.version??0)+1,sha256:sha(bytes),byte_length:bytes.length}
        f.current.set(id,{user,row});f.receipts.set(user+key,row);f.originals.set(`/knowledge/v1/assets/${id}/versions/${row.version_id}/original`,{user,bytes})
        if(f.drop){
          f.drop=false // Start the response before disconnecting; Chrome cannot transparently replay it.
          res.writeHead(200,{'content-type':'application/json','content-length':100})
          return res.write('{',()=>setTimeout(()=>res.destroy(),30))
        }
        if(f.hold){f.hold.arrived.resolve();await f.hold.release.promise}
        return ok(row)
      }
      const original=f.originals.get(req.url.split('?')[0]);if(original?.user===user){
        f.reads.push(req.url);res.writeHead(200,{'content-type':'application/pdf','content-disposition':req.url.endsWith('?download=1')?'attachment; filename="original.pdf"':'inline'});return res.end(original.bytes)
      }
      f.errors.push(req.url);fail(404,'UNKNOWN_ROUTE')
    }catch(e){f.errors.push(String(e));fail(500,'FIXTURE_ERROR')}
  })
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));t.after(()=>{srv.closeAllConnections();return new Promise(r=>srv.close(r))})
  const origin=`http://127.0.0.1:${srv.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close())
  const ctx=await browser.newContext({viewport:{width:1280,height:800}});ctx.setDefaultTimeout(7000);const page=await ctx.newPage()
  page.on('pageerror',e=>f.errors.push(e.message));t.after(()=>assert.deepEqual(f.errors,[]))
  const login=value=>ctx.addCookies([{name:'session',value,url:origin,httpOnly:true}])
  const file=page.getByLabel('PDF 文件',{exact:true}),target=page.getByLabel('导入到'),submit=page.getByRole('button',{name:'导入 PDF'})
  const pick=async(name,bytes)=>{const chooser=page.waitForEvent('filechooser');await file.click();await(await chooser).setFiles({name,mimeType:'application/pdf',buffer:bytes})}
  return {f,ctx,page,login,file,target,submit,pick,url:origin+'/knowledgeos/library'}
}

test('login, raw upload, lost acknowledgement, new version, inline and explicit export',async t=>{
  const {f,page,ctx,login,pick,file,target,submit,url}=await fixture(t)
  await page.goto(url);await page.getByRole('status').filter({hasText:'请先登录'}).waitFor();assert.equal(await file.isEnabled(),false)
  assert.equal(await page.getByRole('link',{name:'账号与登录'}).getAttribute('href'),'/knowledgeos/account')
  assert.equal(await page.getByRole('link',{name:'AI 工具'}).getAttribute('href'),'/knowledgeos/ai')
  await login('alice');await page.reload();await page.getByText('暂无资料',{exact:true}).waitFor()
  const bytes=pdf('one'),name='讲义 #1%.pdf';await pick(name,bytes);f.drop=true;await submit.click()
  await page.getByRole('status').filter({hasText:'重试'}).waitFor();await submit.click()
  const receipt=page.getByRole('region',{name:'导入回执'});await receipt.getByText(sha(bytes),{exact:true}).waitFor()
  assert.equal(f.posts.length,2);const [first,retry]=f.posts;assert.deepEqual(first.bytes,bytes);assert.deepEqual(retry.bytes,bytes)
  assert.equal(first.h['x-knowledgeos-filename'],encodeURIComponent(name));assert.equal(first.h['x-knowledgeos-asset-id'],undefined);assert.equal(first.h['x-knowledgeos-expected-version'],undefined)
  assert.equal(first.h['idempotency-key'],retry.h['idempotency-key']);assert.equal(f.current.size,1)
  const row=[...f.current.values()][0].row,original=`/knowledge/v1/assets/${row.id}/versions/${row.version_id}/original`
  assert.equal(await receipt.getByRole('link',{name:'查看原件'}).getAttribute('href'),original)
  const bytes2=pdf('two');await target.selectOption(row.id);await pick('第二版.pdf',bytes2);await submit.click()
  await receipt.getByText(sha(bytes2),{exact:true}).waitFor();const update=f.posts.at(-1)
  assert.notEqual(update.h['idempotency-key'],first.h['idempotency-key']);assert.equal(update.h['x-knowledgeos-asset-id'],row.id);assert.equal(update.h['x-knowledgeos-expected-version'],'1')
  const download=page.waitForEvent('download');await receipt.getByRole('link',{name:'导出 PDF'}).click();assert.deepEqual(await readFile(await(await download).path()),bytes2)
  assert.equal(f.reads.at(-1),[...f.originals.keys()].at(-1)+'?download=1');assert.deepEqual(await(await ctx.request.get(new URL(original,url).href)).body(),bytes)
  await page.reload();const list=page.getByRole('region',{name:'我的资料'});await list.getByText('第二版.pdf',{exact:true}).waitFor()
  const read=ctx.waitForEvent('request',r=>r.url()===new URL([...f.originals.keys()].at(-1),url).href);await list.getByRole('link',{name:'查看原件'}).click();await read
})

test('actionable failures, changed selection, narrow layout, account switch during POST',async t=>{
  const {f,page,login,pick,file,submit,url}=await fixture(t);await login('alice');await page.goto(url);await page.getByText('暂无资料',{exact:true}).waitFor()
  const status=page.getByRole('status');await pick('旧.pdf',pdf('old'));f.reject=422;await submit.click();await status.filter({hasText:'重新选择'}).waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(),/private|fixture path/)
  const oldKey=f.posts.at(-1).h['idempotency-key'],name='课件'.repeat(48)+'.pdf';await pick(name,pdf('new'));f.reject=0;await submit.click()
  const receipt=page.getByRole('region',{name:'导入回执'});await receipt.getByText(name,{exact:true}).waitFor();assert.notEqual(oldKey,f.posts.at(-1).h['idempotency-key'])
  for(const width of [1280,320]){
    await page.setViewportSize({width,height:800});assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');assert.equal(await page.getByRole('main').count(),1);assert.equal(await page.getByRole('heading',{level:1}).count(),1)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await file.focus();await page.keyboard.press('Tab')
    assert.ok(await receipt.getByRole('link',{name:'查看原件'}).evaluate(e=>e===document.activeElement && e.matches(':focus-visible')))
  }
  await page.getByLabel('导入到').selectOption([...f.current.keys()][0]);await pick('冲突.pdf',pdf('conflict'));f.reject=409;await submit.click();await status.filter({hasText:'刷新'}).waitFor()
  f.reject=0;await page.getByRole('button',{name:'刷新资料'}).click();await pick('延迟.pdf',pdf('late'))
  f.hold={arrived:Promise.withResolvers(),release:Promise.withResolvers()};try{
    await submit.click();await Promise.race([f.hold.arrived.promise,new Promise((_,reject)=>{setTimeout(()=>reject(new Error('upload did not arrive')),7000).unref()})]);await login('bob')
  }finally{f.hold.release.resolve()}
  await page.getByText('bob',{exact:true}).waitFor();await page.getByText('暂无资料',{exact:true}).waitFor();assert.equal(await receipt.isVisible(),false)
  assert.equal(await file.inputValue(),'');assert.doesNotMatch(await page.locator('body').innerText(),/延迟|课件|alice/)
})

test('preflight prevents a selected file from following the cookie to another account',async t=>{
  const {f,ctx,page,login,pick,file,submit,url}=await fixture(t)
  await login('alice');await page.goto(url);await page.getByText('暂无资料',{exact:true}).waitFor()
  await pick('仅限原账号.pdf',pdf('private'));await login('bob');await submit.click()
  await page.getByText('bob',{exact:true}).waitFor();await page.getByText('暂无资料',{exact:true}).waitFor()
  assert.equal(f.posts.length,0);assert.equal(await file.inputValue(),'');assert.equal(await submit.isEnabled(),false)
  await pick('已退出.pdf',pdf('expired'));await ctx.clearCookies();await submit.click()
  await page.getByRole('status').filter({hasText:'请先登录'}).waitFor();assert.equal(await file.isEnabled(),false)
  assert.equal(await file.inputValue(),'');assert.equal(f.posts.length,0);assert.doesNotMatch(await page.locator('body').innerText(),/alice|bob/)
})
