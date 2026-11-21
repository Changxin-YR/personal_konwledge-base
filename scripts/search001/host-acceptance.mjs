// Usage: node scripts/search001/host-acceptance.mjs <candidate> <entry hash> [evidence dir]
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {api,dbPath,entryCookie,login,sql} from '../fnd004/harness.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {chinesePdf,mdBlocks,pdfPages,revised} from './corpus.mjs'
import {wordFixture} from '../read001/word-fixture.mjs'

const [candidate,entry,parent='.cache/search001-acceptance']=process.argv.slice(2)
const root=fileURLToPath(new URL('../../',import.meta.url)), sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root})
const runners=Object.fromEntries(['scripts/search001/host-acceptance.mjs','scripts/search001/corpus.mjs',
  'scripts/search001/fixtures/chinese-search-v1.pdf','scripts/search001/fixtures/chinese-search-v2.pdf',
  'scripts/read001/word-fixture.mjs','scripts/lib004/acceptance-samples.mjs'].map(path=>{
  const hash=sha(readFileSync(join(root,path)))
  assert.equal(hash,sha(git('show',`${candidate}:${path}`)));return [path,hash]
}))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'run-'))
const prefix='/knowledge/v1', password=randomUUID(), report={candidate_sha:candidate,entry_sha256:entry,runners,
  status:'NOT_RUN',T01:'NOT_RUN',T02:'NOT_RUN',A09:'NOT_RUN',queries:[],screens:[],boots:[]}
let host, browser, owner, reader, outsider, phase='boot'
const version=doc=>`/assets/${doc.id}/versions/${doc.version_id}`
const source=doc=>`/knowledgeos/reader?${new URLSearchParams({asset:doc.id,version:doc.version_id})}`
const waitResponse=(page,path,method)=>page.waitForResponse(r=>r.url()===host.base+prefix+path&&r.request().method()===method)

async function req(user,method,path,status,body,headers={},secrets=[]){
  const res=await fetch(host.base+prefix+path,{method,redirect:'error',signal:AbortSignal.timeout(20_000),headers:{cookie:user.cookie,
    ...(method==='GET'?{}:{'x-knowledgeos-request':'1','x-knowledgeos-reader-actor':user.id}),
    ...(body!==undefined&&!Buffer.isBuffer(body)?{'content-type':'application/json'}:{}),...headers},
  body:body===undefined||Buffer.isBuffer(body)?body:JSON.stringify(body)})
  assert([status].flat().includes(res.status),`${method} ${path}: HTTP ${res.status}; expected ${status}`)
  if(res.status===204)return
  const raw=await res.text(), value=JSON.parse(raw)
  if(res.status>=400){assert(!Object.hasOwn(value,'data'));for(const secret of secrets)assert(!raw.includes(secret));return value.code}
  assert(Object.hasOwn(value,'data'));return value.data
}
const search=(user,query)=>req(user,'POST','/search',200,{query})
const access=(user,result,status)=>req(user,'GET',`/search/${result.query_id}/access`,status)
async function boot(flags=[]){
  const started=await host.start(flags);assert(!report.boots.includes(started.pid));report.boots.push(started.pid)
  if(report.boots.length===1){
    const session=await entryCookie(started.entry)
    for(const [op,cookie,name] of [['bootstrap',session.cookie,'setup'],...['owner','reader','outsider'].map(n=>['register','',n])])
      assert.equal((await api(host.port,cookie,'POST',prefix+'/auth/'+op,{login_name:name,display_name:name,password})).status,201)
  }
  ;[owner,reader,outsider]=await Promise.all(['owner','reader','outsider'].map(async name=>{
    const s=await login(host.port,name,password);assert(s.cookie)
    const {id}=await req(s,'GET','/me',200);return {name,cookie:s.cookie,id}
  }))
}
async function upload(name,media,bytes,previous,user=owner){
  const doc=await req(user,'POST','/imports',201,bytes,{'content-type':media,'idempotency-key':randomUUID(),'x-knowledgeos-filename':name,
    ...(previous?{'x-knowledgeos-asset-id':previous.id,'x-knowledgeos-expected-version':'1'}:{})})
  assert.equal(doc.sha256,sha(bytes));assert.equal(doc.title,name)
  if(previous){assert.equal(doc.id,previous.id);assert.notEqual(doc.version_id,previous.version_id);assert.equal(doc.version,2)}
  return doc
}
const markdown=(name,text,user)=>upload(name,'text/markdown',Buffer.from(text),undefined,user)
const parse=(doc,suffix='')=>version(doc)+'/parse'+suffix
const start=doc=>req(owner,'POST',parse(doc,'/start'),202)
const settled=doc=>until(async()=>{const s=await req(owner,'GET',parse(doc),200);return ['complete','partial'].includes(s.state)&&s},'parse settled')
async function context(user){
  const c=await browser.newContext({viewport:{width:1280,height:960},serviceWorkers:'block'}),p=await c.newPage()
  c.setDefaultTimeout(15_000);assert.equal((await c.cookies()).length,0)
  await p.goto(host.base+'/knowledgeos/account');await p.locator('#login_name').fill(user.name)
  await p.locator('#login_password').fill(password);await p.locator('#login').click();await p.locator('#profile').waitFor()
  const s=await c.request.get(host.base+prefix+'/me');assert.equal(s.status(),200);assert.equal((await s.json()).data.id,user.id)
  return [c,p]
}
async function screenshot(page,file){const image=await page.screenshot({path:join(out,file)});report.screens.push({file,sha256:sha(image)})}
async function library(p){await p.goto(host.base+'/knowledgeos/library');await p.locator('#search-submit:enabled').waitFor()}
async function typeSearch(p,q){await p.locator('#search-query').fill(q);await p.locator('#search-submit').click()}
async function uiSearch(p,q){
  const [r]=await Promise.all([waitResponse(p,'/search','POST'),typeSearch(p,q)]);assert.equal(r.status(),200)
  const result=(await r.json()).data;assert(result.items.length>0);await p.locator('#search-results a').first().waitFor();return result
}
const hit=(doc,n,start,end,full)=>({version_id:doc.version_id,ordinal:n,start,end,quote:full.slice(start,end),source_hash:sha(full)})
const compact=({version_id,ordinal,start,end,quote,source_hash})=>({version_id,ordinal,start,end,quote,source_hash})
const sorted=items=>items.slice().sort((a,b)=>a.version_id.localeCompare(b.version_id)||a.ordinal-b.ordinal||a.start-b.start)
async function check(stage,query,expected){
  const r=await search(owner,query), actual=sorted(r.items.map(compact))
  report.queries.push({stage,query,expected:sorted(expected),actual,count:r.count})
  assert.equal(r.count,expected.length,`${stage}: ${query}`);assert.deepEqual(actual,sorted(expected),`${stage}: ${query}`)
  await access(owner,r,200);return r
}
const dbRead=(query,args=[])=>sql(dbPath(host.data),query,args)
function isolatedWrite(fn){const db=new DatabaseSync(dbPath(host.data));try{db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');fn(db);db.exec('COMMIT')}finally{db.close()}}

async function lexical(){
  const pdf=chinesePdf(), md=Buffer.from(mdBlocks.join(''))
  assert.equal(sha(md),'ca3f05585d287628d8b3a0722d3195c2326ca717d64eddd6599b793d5909b4cc')
  const p=await upload('corpus.pdf','application/pdf',pdf),m=await markdown('manual.md',md.toString())
  report.sources={pdf:p.sha256,markdown:m.sha256};await start(p)
  await until(()=>host.events().some(e=>e.event==='held'&&e.page===3),'held real extraction')
  const P=(n,a,b)=>hit(p,n,a,b,pdfPages[n-1]), M=(n,a,b)=>hit(m,n,a,b,mdBlocks[n-1])
  const acl='访问控制列表', alias='存取控制清单', pending='待页朱砂', failed='故页玄铁', review='墨晶'
  for(const [q,expected] of [
    ['盐',[P(1,3,4),P(2,15,16)]],['盐析',[P(1,3,5),P(2,15,17)]],
    [acl,[P(2,3,9),M(3,6,12)]],[alias,[P(2,3,9),M(3,6,12)]],['最小权限原则',[M(3,14,20)]],
    [acl+'（ACL）',[P(2,3,14)]],[acl+'(ACL)',[P(2,3,14)]],['authzCheck',[M(5,18,28)]],
    ['user_id',[M(5,29,36)]],['authzCheck(user_id)',[M(5,18,37)]],['缓存命中',[M(7,2,6)]],
    [pending,[]],[failed,[]],[review,[]],['图页银砂',[]],['火星材料',[]],['铜版',[]],
  ])await check('held',q,expected)
  host.release();await settled(p)
  assert.deepEqual(dbRead('SELECT page,state,text FROM pdf_pages WHERE version_id=? ORDER BY page',[p.version_id]).map(r=>[r.page,r.state,r.text]),
    [[1,'ready',pdfPages[0]],[2,'ready',pdfPages[1]],[3,'ready',pdfPages[2]],[4,'failed',''],[5,'ready',pdfPages[4]],[6,'review','']])
  // Inject only adverse metadata into isolated storage: these are the real extracted bytes, not substitute search results.
  isolatedWrite(db=>{
    db.prepare("UPDATE pdf_pages SET text=? WHERE version_id=? AND page=4 AND state='failed'").run(pdfPages[3],p.version_id)
    db.prepare("UPDATE pdf_pages SET state='review' WHERE version_id=? AND page=5 AND state='ready'").run(p.version_id)
  })
  await check('partial',alias,[P(2,3,9),P(3,8,14),M(3,6,12)])
  await check('partial',pending,[P(3,3,7)]);await check('failed-stale-text',failed,[])
  const observed=await check('review-with-text',review,[P(5,3,5)])
  isolatedWrite(db=>db.prepare("UPDATE pdf_pages SET state='pending' WHERE version_id=? AND page=5").run(p.version_id))
  await check('pending-stale-text',review,[]);await access(owner,observed,404)
  isolatedWrite(db=>db.prepare("UPDATE pdf_pages SET state='review' WHERE version_id=? AND page=5").run(p.version_id))
  await host.stop();await boot()
  await req(owner,'POST',parse(p,'/retry/4'),202);await until(async()=>{
    const s=await req(owner,'GET',parse(p),200);return s.pages.find(x=>x.page===4)?.state==='ready'
  },'targeted retry')
  await check('retry',failed,[P(4,3,7)]);await check('retry',acl,[P(2,3,9),P(3,8,14),P(4,8,14),M(3,6,12)])
  return {p,m,P,M,acl}
}

async function browserChain({p,m,P,M,acl}){
  const [ctx,page]=await context(owner)
  try{
    await library(page);await uiSearch(page,'缓存命中')
    const repeated=page.locator('#search-results a').first(), second=M(7,9,13)
    const link=new URL(await repeated.getAttribute('href'),host.base)
    link.searchParams.set('match',`${second.start}:${second.end}:${second.source_hash}`);await page.goto(link.href)
    const mark=page.locator('#text mark');await mark.waitFor();assert.equal(await mark.textContent(),second.quote)
    assert.equal(await mark.evaluate(el=>el.previousSibling.textContent.length),second.start)
    await library(page);await uiSearch(page,acl+'(ACL)')
    const anchor=page.getByRole('link',{name:'corpus.pdf',exact:true});const old=await anchor.getAttribute('href')
    assert.equal(new URL(old,host.base).searchParams.get('unit'),'2');await screenshot(page,'chinese-query.png')
    const p2=await upload('corpus.pdf','application/pdf',chinesePdf(2),p);await start(p2);await settled(p2)
    report.sources.revised_pdf=p2.sha256
    await check('replacement','铜版',[hit(p2,1,4,6,revised)])
    await check('replacement',acl+'(ACL)',[P(2,3,14),hit(p2,1,7,18,revised)])
    await anchor.click();await mark.waitFor();const expected=P(2,3,14)
    assert.equal(await mark.textContent(),expected.quote);assert.equal(await page.locator('#text').textContent(),pdfPages[1]);assert.equal(await page.locator('#number').inputValue(),'2')
    assert.equal(new URL(page.url()).searchParams.get('version'),p.version_id)
    await until(()=>dbRead('SELECT ordinal,source_hash FROM reading_positions WHERE version_id=? AND user_id=?',[p.version_id,owner.id])
      .some(r=>r.ordinal===2&&r.source_hash===expected.source_hash),'search opening saves position')
    await page.locator('#paper').click();await page.locator('#original img').waitFor()
    const ink=await page.locator('#original').evaluate(async el=>{
      const img=el.querySelector('img');await img.decode();const canvas=document.createElement('canvas')
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
      const imageBox=img.getBoundingClientRect(), sx=canvas.width/imageBox.width,sy=canvas.height/imageBox.height
      const boxes=[...el.querySelectorAll('.highlight')].map(n=>n.getBoundingClientRect())
      return boxes.map(b=>{
        const {data}=ctx.getImageData(Math.floor((b.left-imageBox.left)*sx),Math.floor((b.top-imageBox.top)*sy),
          Math.ceil(b.width*sx),Math.ceil(b.height*sy));let dark=0
        for(let i=0;i<data.length;i+=4)if(data[i]<150&&data[i+1]<150&&data[i+2]<150)dark++
        return dark
      })
    })
    assert.equal(ink.length,expected.quote.length);assert(ink.every(pixels=>pixels>10),`missing rendered glyph in highlighted range: ${ink}`)
    report.highlighted_pdf_glyph_ink=ink;await screenshot(page,'fixed-v1-original-page.png')
    await page.locator('#structured').click();await page.locator('#bookmark-title').fill('搜索定位书签');await page.locator('#bookmark-add').click()
    await page.locator('#bookmarks').getByText('搜索定位书签',{exact:true}).waitFor()
    await page.locator('#annotate:enabled').click();await page.locator('#annotation-body').fill('检索回读批注')
    const aPath=version(p)+'/reader-annotations?unit=2'
    const [annotation]=await Promise.all([waitResponse(page,aPath,'POST'),page.locator('#annotation-submit').click()]);assert.equal(annotation.status(),201)
    const item=(await annotation.json()).data
    assert.deepEqual([item.ordinal,item.start,item.end,item.source_hash,item.revision],[2,expected.start,expected.end,expected.source_hash,1])
    await page.locator('#annotation-items').getByText('检索回读批注',{exact:true}).waitFor();await screenshot(page,'bookmark-and-annotation.png')
    await host.stop();await boot()
    const [fresh,reopened]=await context(owner)
    try{
      await reopened.goto(host.base+source(p));const params=new URL(reopened.url()).searchParams
      assert.deepEqual([...params.keys()],['asset','version']);await reopened.locator('#original img').waitFor()
      assert.equal(await reopened.locator('#number').inputValue(),'2');assert((await reopened.locator('#version').textContent()).includes(p.version_id))
      await reopened.locator('#bookmarks').getByText('搜索定位书签',{exact:true}).waitFor()
      await reopened.locator('#annotations-toggle').click();await reopened.locator('#annotation-items').getByText('检索回读批注',{exact:true}).waitFor()
      const receipt=await req(owner,'GET','/citations/'+item.citation_id+'/resolve',200)
      assert.equal(receipt.quote,expected.quote);assert.equal(receipt.version_id,p.version_id)
      assert.equal(dbRead('SELECT ordinal FROM reading_bookmarks WHERE version_id=? AND user_id=?',[p.version_id,owner.id])[0].ordinal,2)
      assert.equal(dbRead('SELECT ordinal FROM citations WHERE id=?',[item.citation_id])[0].ordinal,2)
      await screenshot(reopened,'restored-after-host-restart.png')
    }finally{await fresh.close()}
    report.restored={version:p.version_id,replacement:p2.version_id,ordinal:2,citation:item.citation_id,source_hash:expected.source_hash}
  }finally{await ctx.close()}
}

const deferred=()=>Promise.withResolvers()
async function permissionChecks(){
  const q='quartzneedle', secret='never return this source', project=await req(owner,'POST','/projects',201,{name:'Search gate fixture'})
  const addMember=(who,expires_at)=>req(owner,'POST',`/projects/${project.id}/memberships`,204,{user_id:who.id,role:'member',...(expires_at?{expires_at}:{})})
  const grant=(doc,who,expires_at)=>req(owner,'POST','/grants',201,{object_id:doc.id,subject_type:'user',subject_id:who.id,
    action:'read',...(expires_at?{expires_at}:{})})
  const revoke=g=>req(owner,'POST','/grants/revoke',204,{grant_id:g.id})
  await addMember(reader)
  const r=await markdown('baseline.md',`Intro: ${q} visible to its owner.`,reader)
  const r2=await markdown('baseline-two.md',`Second source: ${q}.`,reader)
  const attached=async(name,text)=>{
    const doc=await markdown(name,text)
    const o=await req(owner,'POST','/objects',201,{scope:'project',project_id:project.id,object_type:'asset',title:name,body:'Synthetic source attachment'})
    // No project import UI in this unit. Place only an already imported synthetic version into the real project object.
    isolatedWrite(db=>{
      db.prepare('INSERT INTO assets VALUES(?)').run(o.id)
      assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(o.id,doc.version_id,doc.id).changes,1)
    });return {...doc,id:o.id}
  }
  const shared=await attached('z-project.md',`Project ${q}: ${secret}.`), timed=await attached('timed.md',`${q} expiringfixture`)
  const otherGrant=await grant(shared,outsider)
  const visible=await search(reader,q);assert.equal(visible.count,2)
  assert.deepEqual(new Set(visible.items.map(x=>x.version_id)),new Set([r.version_id,r2.version_id]))
  assert.equal((await search(outsider,q)).count,0,'a direct read grant is not project membership')
  const permitted=await grant(shared,reader)
  const baseline=await search(reader,q);assert.equal(baseline.count,3)
  assert.deepEqual(new Set(baseline.items.map(x=>x.version_id)),new Set([r.version_id,r2.version_id,shared.version_id]))
  const ranking=id=>dbRead('SELECT normalized_query,index_version,result_source_versions,ranking_inputs FROM search_queries WHERE query_id=?',[id])[0]
  for(let n=0;n<31;n++)await markdown(`aa-hidden-${String(n).padStart(2,'0')}.md`,`${q}\n\n${secret}`)
  const withNoise=await search(reader,q);assert.deepEqual(withNoise.items,baseline.items);assert.equal(withNoise.count,baseline.count)
  assert.deepEqual(ranking(withNoise.query_id),ranking(baseline.query_id))
  const capped=await search(owner,q);assert.equal(capped.items.length,30);assert.equal(capped.count,30)
  assert.equal(JSON.parse(ranking(capped.query_id).ranking_inputs).length,capped.count)
  await access(outsider,baseline,404)
  const expiry=Date.now()+2700
  await grant(timed,reader,new Date(expiry).toISOString())
  const before=await search(reader,'expiringfixture');assert.equal(before.count,1);await access(reader,before,200)
  await until(()=>Date.now()>expiry,'grant expiry')
  assert.equal((await search(reader,'expiringfixture')).count,0);await access(reader,before,404)
  await req(reader,'GET',version(timed)+'/reader?unit=1',404,undefined,{},['expiringfixture'])
  await revoke(otherGrant)

  const timedText=`${q} scansnapshot`, final=await attached('final-check.md',timedText), between=Date.now()+3100
  await grant(final,reader,new Date(between).toISOString())
  const open=await search(reader,'scansnapshot');assert.equal(open.count,1);await access(reader,open,200)
  host.gateSearch({until:between,version:final.version_id,text:timedText})
  const guarded=await search(reader,'scansnapshot'), boundary=host.searchGateFacts()
  assert(boundary.scannedAt<between&&boundary.releasedAt>between);assert.equal(boundary.version,final.version_id)
  assert.deepEqual(guarded.items,[]);assert.equal(guarded.count,0);assert.equal(ranking(guarded.query_id).ranking_inputs,'[]')
  await access(reader,open,404)
  report.final_acl_recheck={...boundary,authorized_before_scan:1,visible_after_scan:0,http_receipt_excluded:true}

  const [ctx,page]=await context(reader)
  let held
  const realQuery=host.base+prefix+'/search'
  try{
    await library(page);await uiSearch(page,q)
    const link=await page.getByRole('link',{name:'z-project.md',exact:true}).getAttribute('href')
    const delay=async(route,expected)=>{
      if(route.request().method()!=='POST'||route.request().postDataJSON().query!==expected)return route.continue()
      const h=held, response=await route.fetch({maxRedirects:0});assert.equal(response.status(),200)
      h.arrived.resolve((await response.json()).data)
      await h.release.promise;await route.fulfill({response});h.finished.resolve()
    }
    let gate=(route)=>delay(route,q)
    await page.route(realQuery,gate)
    held={arrived:deferred(),release:deferred(),finished:deferred()}
    await typeSearch(page,q);const stale=await Promise.race([held.arrived.promise,new Promise((_,rej)=>setTimeout(()=>rej(Error('search delay not reached')),10_000).unref())])
    assert.equal(stale.count,3);await revoke(permitted)
    assert.equal((await search(reader,q)).count,2);await access(reader,stale,404)
    const receipt=waitResponse(page,'/search/'+stale.query_id+'/access','GET');held.release.resolve()
    assert.equal((await receipt).status(),404);await page.locator('#search-status').getByText('无法确认检索结果，请重试。').waitFor()
    assert.equal(await page.locator('#search-results li').count(),0);await page.unroute(realQuery,gate)
    await screenshot(page,'stale-search-rejected.png')
    await page.goto(new URL(link,host.base).href);await page.getByText('资料不可访问，请核对账号与当前权限。',{exact:true}).waitFor()
    assert.equal(await page.locator('#text').textContent(),'');assert.equal(await page.locator('#original img').count(),0)
    await req(reader,'GET',version(shared)+'/reader?unit=1',404,undefined,{},[secret])
    await library(page)
    gate=route=>delay(route,q);await page.route(realQuery,gate)
    held={arrived:deferred(),release:deferred(),finished:deferred()};await typeSearch(page,q)
    await Promise.race([held.arrived.promise,new Promise((_,rej)=>setTimeout(()=>rej(Error('older search not held')),10_000).unref())])
    await markdown('newest.md','latestfixture',reader);await uiSearch(page,'latestfixture')
    held.release.resolve();await held.finished.promise
    await page.getByRole('link',{name:'newest.md',exact:true}).waitFor()
    assert.deepEqual(await page.locator('#search-results a').allTextContents(),['newest.md'])
    report.permissions={member_without_read:0,read_without_membership:0,valid_matches:3,hidden_matches:31,
      same_rank_inputs_and_snippets:true,expired_reader_denied:true,revoked_receipt:404,stale_browser_response_cleared:true,older_response_did_not_replace_newer:true}
  }finally{held?.release.resolve();await ctx.close()}
}

async function officeChecks(){
  const q='OnlyWordNeedle', bytes=wordFixture(['Converted passage: '+q+'.']), doc=await upload('word-search.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes)
  const path=version(doc)+'/office', docs=()=>req(owner,'GET',path,200), term=()=>search(owner,q)
  assert.equal((await term()).count,0)
  async function convert(){
    const job=await req(owner,'POST',path+'/start',202,undefined,{'idempotency-key':randomUUID()})
    await until(async()=>{
      const row=(await docs()).conversions.find(r=>r.id===job.id)
      assert(row&&['queued','running','ready'].includes(row.state),JSON.stringify(row));return row.state==='ready'
    },'real Office conversion',180_000)
    return job.id
  }
  const first=await convert()
  const find=async id=>until(async()=>{const result=await term();return result.items.some(x=>x.conversion_id===id)&&result},'converted page published',30_000)
  const firstHit=await find(first)
  assert.deepEqual(firstHit.items.map(r=>[r.kind,r.conversion_id,r.ordinal,r.quote]),[['office',first,1,q]])
  assert.equal((await search(outsider,q)).count,0);await access(outsider,firstHit,404)
  const [ctx,page]=await context(owner)
  try{
    await library(page);await uiSearch(page,q)
    const link=page.getByRole('link',{name:'word-search.docx',exact:true}), href=new URL(await link.getAttribute('href'),host.base)
    assert.equal(href.searchParams.get('conversion'),first);assert.equal(href.searchParams.get('version'),doc.version_id)
    const second=await convert(), both=await find(second);assert.notEqual(first,second)
    assert.deepEqual(new Set(both.items.map(r=>r.conversion_id)),new Set([first,second]))
    await access(owner,firstHit,200)
    const readerPath=version(doc)+`/reader?unit=1&conversion=${first}`
    const [readerReply]=await Promise.all([waitResponse(page,readerPath,'GET'),link.click()]);assert.equal(readerReply.status(),200)
    const pageData=(await readerReply.json()).data;assert.equal(pageData.conversion_id,first)
    assert.equal(pageData.text.slice(firstHit.items[0].start,firstHit.items[0].end),q)
    assert.equal(pageData.anchor,firstHit.items[0].source_hash)
    const mark=page.locator('#text mark');await mark.waitFor();assert.equal(await mark.textContent(),q)
    const persisted=dbRead(`SELECT p.text,b.sha256 FROM word_search_pages p JOIN word_search_runs r USING (conversion_id)
      JOIN blobs b ON b.id=r.result_blob_id WHERE p.conversion_id=? AND p.page=1`,[first])[0]
    assert.equal(persisted.text,pageData.text);assert.equal(persisted.sha256,pageData.original_sha256)
    await screenshot(page,'word-conversion-match.png')
    report.word={source_sha256:doc.sha256,version:doc.version_id,first,second,ordinal:1,
      fixed_converted_pdf_sha256:pageData.original_sha256,matched_quote:q,outsider_count:0}
  }finally{await ctx.close()}
}

try{
  host=await isolate(candidate,entry,{searchBarrier:true});report.binding=host.facts;await boot(['hold3','fail4'])
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.chrome=browser.version()
  phase='T01 fixed corpus';const fixtures=await lexical()
  phase='A09 reader chain';await browserChain(fixtures);report.T01='PASS'
  phase='T02 real grants and late responses';await permissionChecks();report.T02='PASS'
  phase='Word conversion search';await officeChecks()
  assert.equal(dbRead('PRAGMA user_version')[0].user_version,19)
  report.A09='PASS'
  report.status='PASS'
}catch(e){report.status='FAIL';report.failure={phase,message:(e.stack??String(e)).slice(0,2400)}}
finally{
  try{await browser?.close()}finally{await host?.stop()}
  report.exit=report.status==='PASS'?0:1
  writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n')
  console.log(report.status,out,report.failure?.phase??'');process.exitCode=report.exit
}
