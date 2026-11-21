import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { buildReaderHtml } from '../../packages/knowledgeos-panel/src/host/reader-page.ts'
import { buildLibraryHtml } from '../../packages/knowledgeos-panel/src/host/library-page.ts'

const pw = resolve(process.env.KO_TEST_CACHE ?? '.cache', 'panel-builder/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(pw).href)
let browser
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }) })
after(async () => { await browser?.close() })
const sha = text => createHash('sha256').update(text).digest('hex')
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+woAAAAASUVORK5CYII='
async function fixture(t) {
  const asset = randomUUID(), version = randomUUID(), conversion = randomUUID(), cid = randomUUID()
  const url = 'http://localhost/knowledgeos/reader?asset='+asset+'&version='+version
  const text = '例🙂甲\n例🙂乙', spec = { asset_id:asset, version_id:version, ordinal:1000, start:5, end:8, source_hash:sha(text), conversion_id:conversion }
  const citation = { ...spec, id:cid, quote_hash:sha('例🙂') }
  const row = { id:asset, version_id:version, version:1, title:'旧稿.docx', byte_length:123, sha256:sha('original'), media_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  const peer = { user:'alice', calls:[], writes:[], denied:false, citation, reader: n => ({ asset_id:asset, version_id:version, ordinal:n, kind:'office', total:10000, state:'ready', text, chapter:'章节 '+n, anchor:sha(text), image:png, width:100, height:100, conversion_id:conversion, boxes:[{ start:5,end:8,x:12,y:25,width:20,height:8 }] }) }
  const ctx = await browser.newContext(), page = await ctx.newPage(), errors=[]
  t.after(async () => { await ctx.close(); assert.deepEqual(errors,[]) }); page.on('pageerror', e=>errors.push(e.message)); page.setDefaultTimeout(5000)
  await ctx.route('http://localhost/**', async r => {
    const u=new URL(r.request().url()), p=u.pathname, reply=data=>r.fulfill({json:{data}})
    if(p==='/knowledgeos/library'||p==='/knowledgeos/reader') return r.fulfill({contentType:'text/html; charset=utf-8', body:p.endsWith('reader')?buildReaderHtml():buildLibraryHtml()})
    if(p==='/knowledge/v1/me') return reply({id:peer.user})
    if(p==='/knowledge/v1/assets') return reply({items:[{...row,version_id:cid,version:2}, {...row,...peer.row}]})
    const base='/knowledge/v1/assets/'+asset+'/versions/'+version
    if(p===base+'/parse')return reply({state:'partial',total:12,error:null,pages:[{page:12,state:'ready',chapter:'第十二章',error:null},{page:11,state:'failed',chapter:'未完成',error:'ERR'}]})
    if(p===base+'/office')return reply({version_id:version,conversions:[cid,conversion].map(id=>({id,state:'ready',page_count:12,missing_fonts:[],failure_code:null,notes:[]}))})
    if(peer.denied) return r.fulfill({status:404})
    if(p===base+'/reader-access'){
      const data={actor_id:peer.user,asset_id:asset,version_id:version,version:1,is_latest:false}
      if(peer.access)await peer.access();return reply(data)
    }
    if(p===base+'/reader-state'&&r.request().method()==='GET')return reply({actor_id:peer.user,revision:0,position:null,bookmarks:[]})
    if(p===base+'/reader-outline')return reply({actor_id:peer.user,items:[]})
    if(p==='/knowledge/v1/citations/'+cid+'/resolve') return reply(peer.citation)
    if(p==='/knowledge/v1/citations') {
      peer.writes.push({body:r.request().postDataJSON(),headers:r.request().headers()}); if(peer.drop){peer.drop=false;return r.abort('failed')} return reply(peer.citation)
    }
    if(p==='/knowledge/v1/assets/'+asset+'/versions/'+version+'/reader') {
      peer.calls.push(Object.fromEntries(u.searchParams)); const d=await peer.reader(Number(u.searchParams.get('unit'))); return typeof d==='number'?r.fulfill({status:d}):reply(d)
    }
    errors.push('Unexpected route: '+p); return r.abort()
  })
  return {page,peer,url,version,conversion,cid,text,spec}
}

test('library opens fixed version; virtual navigation, exact repeat selection and idempotent citation replay', async t=>{
  const {page,peer,url,version,conversion,cid,text,spec}=await fixture(t)
  await page.goto('http://localhost/knowledgeos/library'); const link=page.locator('a[href$="version='+version+'"]'); await link.first().click()
  assert.equal(page.url(),url); await page.getByText(/旧版本/).first().waitFor()
  await page.getByLabel('跳转位置').fill('1000'); await page.getByRole('button',{name:'跳转',exact:true}).click()
  await page.getByText('章节 1000',{exact:true}).waitFor(); assert.deepEqual(peer.calls,[{unit:'1'},{unit:'1000',conversion}]); assert.ok(await page.locator('#window button').count()<30)
  await page.getByRole('button',{name:'结构文本',exact:true}).click(); await page.locator('#text').waitFor();assert.equal(await page.locator('#text').innerText(),text)
  await page.locator('#text').evaluate(el=>{const r=new Range(); r.setStart(el.firstChild,5); r.setEnd(el.firstChild,8); getSelection().removeAllRanges();getSelection().addRange(r)})
  peer.drop=true; await page.getByRole('button',{name:'生成引用链接'}).click(); await page.getByText(/重试本次引用/).waitFor(); await page.getByRole('button',{name:'生成引用链接'}).click()
  const out=page.getByRole('link',{name:'打开引用'}); await out.waitFor(); assert.equal(await out.getAttribute('href'),url+'&citation='+cid)
  assert.equal(peer.writes.length,2); const [a,b]=peer.writes;assert.deepEqual(a.body,spec);assert.deepEqual(b.body,spec);assert.equal(a.headers['x-knowledgeos-request'],'1');assert.match(a.headers['idempotency-key'],/^[a-f0-9-]{36}$/);assert.equal(b.headers['idempotency-key'],a.headers['idempotency-key'])
  await out.click(); await page.locator('#original .highlight').waitFor(); assert.equal(await page.locator('#original .highlight').evaluate(el=>el.style.left),'12%'); assert.deepEqual(peer.calls.at(-1),{unit:'1000',conversion})
  await page.getByRole('button',{name:'结构文本',exact:true}).click();assert.equal(await page.locator('#text mark').innerText(),'例🙂');assert.equal(await page.locator('#text mark').evaluate(el=>el.previousSibling.textContent),'例🙂甲\n')
  await page.setViewportSize({width:320,height:720}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
})

test('nonready and failed pages remain navigable; stale results and revoked ACL cannot repaint',async t=>{
  const {page,peer,url}=await fixture(t), produce=peer.reader, held=Promise.withResolvers(), entered=Promise.withResolvers(); t.after(()=>held.resolve())
  peer.reader=async n=>{if(n===2){entered.resolve();await held.promise} return {...produce(n),kind:'pdf',conversion_id:undefined,state:n===1?'pending':n===3?'failed':'ready',text:'private-'+n,anchor:sha('private-'+n)}}
  await page.goto(url);await page.getByText(/尚未就绪/).waitFor();await page.getByLabel('跳转位置').fill('2');await page.getByRole('button',{name:'跳转',exact:true}).click();await entered.promise
  await page.getByLabel('跳转位置').fill('3');await page.getByRole('button',{name:'跳转',exact:true}).click();await page.getByText(/解析失败/).waitFor();const late=page.waitForResponse(r=>r.url().endsWith('unit=2'));held.resolve();await (await late).finished();assert.doesNotMatch(await page.locator('body').innerText(),/private-2/)
  peer.denied=true;await page.getByRole('button',{name:'刷新'}).click();await page.getByText(/不可访问/).waitFor();assert.equal(await page.locator('img,#window button').count(),0)
})

test('different account opens shared link via resolve and protected source; hash mismatch never highlights',async t=>{
  const {page,peer,url,cid}=await fixture(t);peer.user='bob';peer.denied=true;await page.goto(url+'&citation='+cid);await page.getByText(/不可访问/).waitFor();assert.deepEqual(peer.calls,[])
  peer.denied=false;peer.citation.quote_hash=sha('different');await page.reload();await page.getByText(/引用.*不匹配/).waitFor();assert.equal(await page.locator('mark,.highlight').count(),0)
})

test('refresh after leaving a citation retries the intended fixed page, even after multiple transient failures',async t=>{
  const {page,peer,url,cid,conversion}=await fixture(t),source=peer.reader;let failures=2
  peer.reader=n=>n===1001&&failures-->0?503:source(n)
  await page.goto(url+'&citation='+cid);await page.locator('#original .highlight').waitFor();await page.locator('#next').click()
  for(let i=0;i<2;i++){
    await page.getByText(/本处加载失败/).waitFor();assert.equal(await page.locator('#number').inputValue(),'1001');await page.locator('#refresh').click()
  }
  await page.getByText('章节 1001',{exact:true}).waitFor();assert.deepEqual(peer.calls,[{unit:'1000',conversion},...Array.from({length:3},()=>({unit:'1001',conversion}))]);assert.equal(await page.locator('.highlight').count(),0)
})

test('idle foreground reader clears cached content after revocation without reloading the page',async t=>{
  const {page,peer,url}=await fixture(t);await page.goto(url);await page.locator('#original img').waitFor();peer.denied=true
  await page.getByText(/不可访问/).waitFor();assert.equal(await page.locator('#text').textContent(),'');assert.equal(await page.locator('img,#window button').count(),0);assert.equal(await page.locator('#version').textContent(),'');assert.equal(peer.calls.length,1)
})

test('view switch fails closed on slow access check; releasing a late grant does not restore content',async t=>{
  const {page,peer,url}=await fixture(t);await page.goto(url);await page.locator('#original img').waitFor();const held=Promise.withResolvers();t.after(()=>held.resolve());peer.access=()=>held.promise
  await page.locator('#structured').click();assert.equal(await page.locator('#text').textContent(),'');await page.getByText(/无法确认/).waitFor();assert.equal(await page.locator('img').count(),0)
  held.resolve();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.locator('#text').textContent(),'');assert.equal(await page.locator('#modes').isVisible(),false)
})

test('T01 parsed chapter opens its exact PDF page with no first-page fetch',async t=>{
  const {page,peer,url,version}=await fixture(t), source=peer.reader;peer.row={media_type:'application/pdf'};peer.reader=n=>({...source(n),kind:'pdf',conversion_id:undefined})
  await page.goto('http://localhost/knowledgeos/library');await page.locator('#parse-version').selectOption(version)
  const rows=page.locator('#parse-pages li');await rows.filter({hasText:'第十二章'}).getByRole('link').click();assert.equal(page.url(),url+'&unit=12')
  await page.locator('#original img').waitFor();assert.deepEqual(peer.calls,[{unit:'12'}])
})
test('layout notice is specific to available PDF extraction, not original or Word mode',async t=>{
  const {page,peer,url}=await fixture(t),source=peer.reader,status=page.locator('#status'),notice=/提取文本不等同于原页版式/
  peer.reader=n=>({...source(n),kind:'pdf',conversion_id:undefined})
  await page.goto(url);await page.locator('#original img').waitFor();assert.doesNotMatch(await status.innerText(),notice)
  await page.locator('#structured').click();await page.getByText(notice).waitFor()
  peer.reader=n=>({...source(n),kind:'pdf',conversion_id:undefined,state:'pending',image:undefined,text:'',anchor:sha('')})
  await page.locator('#next').click();await status.filter({hasText:/尚未就绪/}).waitFor();assert.doesNotMatch(await status.innerText(),notice)
  peer.reader=source
  await page.goto(url);await page.locator('#original img').waitFor();await page.locator('#structured').click()
  await page.locator('#text').waitFor();assert.doesNotMatch(await status.innerText(),notice)
})
test('Word history opens exactly the chosen conversion; account change during fetch clears the page',async t=>{
  const {page,peer,url,version,conversion}=await fixture(t);await page.goto('http://localhost/knowledgeos/library');await page.locator('#office-version').selectOption(version)
  await page.locator('#office-attempts li').filter({hasText:conversion}).getByRole('link').click();assert.equal(page.url(),url+'&conversion='+conversion)
  await page.locator('#original img').waitFor();assert.deepEqual(peer.calls,[{unit:'1',conversion}]);const source=peer.reader;peer.reader=n=>{peer.user='bob';return source(n)}
  await page.getByRole('button',{name:'刷新'}).click();await page.getByText(/账号已切换/).waitFor();assert.equal(await page.locator('img,#window button').count(),0);assert.equal(await page.locator('#version').innerText(),'')
})

test('text-only deep link verifies the exact source range; missing pixel boundaries do not manufacture a highlight',async t=>{
  const {page,peer,url,cid,text}=await fixture(t), src=peer.reader; delete peer.citation.conversion_id
  peer.reader=n=>({...src(n),kind:'text',image:undefined,width:undefined,height:undefined,conversion_id:undefined,boxes:undefined})
  await page.goto(url+'&citation='+cid);await page.locator('#text mark').waitFor();assert.equal(await page.locator('#text').innerText(),text);assert.equal(await page.locator('img').count(),0)
  peer.reader=n=>({...src(n),kind:'pdf',conversion_id:undefined,boxes:[{start:0,end:text.length,x:0,y:0,width:100,height:20}]})
  await page.reload();await page.getByText(/缺少精确选区坐标/).waitFor();assert.equal(await page.locator('.highlight').count(),0)
  await page.locator('#structured').click();assert.equal(await page.locator('#text mark').innerText(),'例🙂')
})

test('deep link uses saved glyphs exclusively, and refuses geometry from a different original',async t=>{
  const {page,peer,url,cid}=await fixture(t),src=peer.reader,original=sha('fixed conversion bytes')
  peer.reader=n=>({...src(n),original_sha256:original});const d=peer.reader(1000)
  peer.citation.locator={geometry:{page:1000,width:d.width,height:d.height,source_sha256:original,boxes:[{...d.boxes[0],x:53}]}}
  await page.goto(url+'&citation='+cid);await page.locator('.highlight').waitFor();assert.equal(await page.locator('.highlight').evaluate(el=>el.style.left),'53%')
  peer.citation.locator.geometry.source_sha256=sha('unrelated original');await page.reload();await page.getByText(/缺少精确选区坐标/).waitFor();assert.equal(await page.locator('.highlight').count(),0)
  await page.locator('#structured').click();assert.equal(await page.locator('#text mark').innerText(),'例🙂')
})
