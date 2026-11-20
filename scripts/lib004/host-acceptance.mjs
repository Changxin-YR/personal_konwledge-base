/** Frozen run: node scripts/lib004/host-acceptance.mjs <full candidate SHA> <entry SHA256> [evidence parent]
 * Offline renderer check: --self-test. Lifecycle-only diagnostic: --session-smoke <SHA> <entry SHA256>.
 * KO_TEST_CACHE: frozen harness runtime/cache; PYTHON: Python with pypdfium2 and Pillow.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url)), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, stdio: ['ignore','pipe','pipe'] })
function freeze(candidate) {
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), candidate)
  const scope = ['scripts/lib004', 'scripts/lib003', 'scripts/lib002', 'scripts/fnd003', 'scripts/fnd004', 'scripts/fnd005']
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--', ...scope).length, 0)
  return Object.fromEntries(git('ls-files', '-z', '--', ...scope).toString().split('\0').filter(f => f.endsWith('.mjs')).map(f => {
    const hash = sha(readFileSync(join(root, f))); assert.equal(hash, sha(git('show', candidate + ':' + f))); return [f, hash]
  }))
}

// Read the downloaded PDF, not a Chrome PDF viewer placeholder. Measure the actual glyph positions
// (plain text flattens cells and indentation) and image colors in the rendered page.
const raster = String.raw`
import json, sys
import pypdfium2 as pdfium
doc = pdfium.PdfDocument(sys.stdin.buffer.read()); assert len(doc) == 1
page = doc[0]; text = page.get_textpage(); s = text.get_text_range(0,text.count_chars())
def pos(token):
    i = s.index(token); x,y,_,_ = text.get_charbox(i); return x,y
rev = sys.argv[2]; assert 'A08 sample V' + rev in s
a,b = pos('Item'),pos('Count'); c,d = pos('Quartz'),pos('17' if rev=='1' else '29')
assert a[0]<b[0] and c[0]<d[0] and abs(a[1]-b[1])<4 and abs(c[1]-d[1])<4 and a[1]>c[1]
assert abs(a[0]-c[0])<6 and abs(b[0]-d[0])<6
i,j = pos('if count < 20:'),pos('mark(count)'); assert i[1]>j[1] and j[0]>i[0]
im = page.render(scale=1.25).to_pil().convert('RGB'); im.save(sys.argv[1])
blue = lambda p: p[2]>110 and p[2]>p[0]+60 and p[2]>p[1]+25
gold = lambda p: p[0]>160 and p[1]>105 and p[1]>p[2]+55
pts = [(x,y) for y in range(im.height) for x in range(im.width) if blue(im.getpixel((x,y))) or gold(im.getpixel((x,y)))]
assert len(pts)>100; xs,ys=zip(*pts); x,y=min(xs),min(ys); w,h=max(xs)-x+1,max(ys)-y+1
assert .8<w/h<1.2
for dx,dy,color in [(.25,.25,blue),(.75,.25,gold),(.25,.75,blue),(.75,.75,blue)]: assert color(im.getpixel((int(x+w*dx),int(y+h*dy))))
print(json.dumps({'pdfium':str(pdfium.PDFIUM_INFO),'pages':1,'cells_aligned':True,'gold_upper_right':True,'code_indent_pt':round(j[0]-i[0],2)}))
`
function inspect(bytes, rev, output) {
  const facts = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-I','-c',raster,output,String(rev)],
    { input: bytes, stdio: ['pipe','pipe','pipe'], timeout: 45000, windowsHide: true }))
  const png = readFileSync(output); assert.equal(png.readUInt32BE(0), 0x89504e47)
  return { ...facts, png_sha256: sha(png), pdf_sha256: sha(bytes) }
}
const args = process.argv.slice(2), smoke = args[0] === '--session-smoke'; if (smoke) args.shift()
if (args[0] === '--self-test') {
  const { acceptanceSamples } = await import('./acceptance-samples.mjs'), pdf = acceptanceSamples()['a08-reference.pdf']
  const path = join(mkdtempSync(join(tmpdir(), 'a08-render-')), 'reference.png')
  assert(inspect(pdf, 1, path).code_indent_pt > 0); assert.throws(() => inspect(pdf, 2, path))
  console.log('PASS: PDFium reference layout, image, indentation and wrong-version negative control (offline only)')
} else {
  const [candidate, hash, parent = tmpdir()] = args
  assert(args.length <= 3 && /^[a-f0-9]{40}$/.test(candidate) && /^[a-f0-9]{64}$/.test(hash), 'Supply full candidate and entry hashes')
  mkdirSync(resolve(parent), { recursive: true }); const out = mkdtempSync(join(resolve(parent), 'lib004-'))
  const report = { candidate, entry_sha256: hash, node: process.version, status: 'NOT_RUN', scope: { T01: 'NOT_RUN', A08: 'NOT_RUN' }, events: [] }
  const save = () => writeFileSync(join(out,'summary.json'), JSON.stringify(report,null,2)+'\n')
  const log = (step, facts = {}) => { report.events.push({ step, at: new Date().toISOString(), ...facts }); save() }
  let host, browser, owner, reader, anon, page, step = 'binding', active, session, origin, boot, files, until, observe, dbPath
  const phase = name => { step = name; log(name) }; const pageErrors = []
  const prefix='/knowledge/v1', assets=prefix+'/assets', library='/knowledgeos/library'
  const vpath=r=>assets+'/'+r.id+'/versions/'+r.version_id, office=r=>vpath(r)+'/office'
  const get=(ctx,path)=>ctx.request.get(host.base+path,{maxRedirects:0})
  const post=(ctx,path,body)=>ctx.request.post(host.base+path,{maxRedirects:0,headers:{origin:host.base,'x-knowledgeos-request':'1','idempotency-key':randomUUID()},data:body})
  async function data(res,status=200){assert.equal(res.status(),status);return (await res.json()).data}
  async function denied(res,status){assert.equal(res.status(),status);const body=await res.json();assert(!Object.hasOwn(body,'data'));assert.equal(typeof body.code,'string')}
  async function login(ctx,name,password){
    const p=await ctx.newPage();p.on('pageerror',()=>pageErrors.push('page exception'));await p.goto(host.base+'/knowledgeos/account')
    await p.locator('#login_name').fill(name);await p.locator('#login_password').fill(password);await p.locator('#login').click();await p.locator('#profile').waitFor()
    assert.equal((await data(await get(ctx,prefix+'/me'))).login_name,name);return p
  }
  async function openLibrary(){await page.goto(host.base+library);await page.getByText('资料已刷新。',{exact:true}).waitFor()}
  async function clickPreview(link,path){
    assert.equal(await link.getAttribute('href'),path)
    const [request]=await Promise.all([page.context().waitForEvent('request',r=>r.url()===host.base+path),link.click()]);assert.equal(request.method(),'GET')
    for(const p of page.context().pages())if(p!==page)await p.close()
  }
  async function upload(name, prev, source){
    await openLibrary(); const word=name.endsWith('.docx');await page.getByLabel('导入格式').selectOption(word?'word':'pdf')
    if(prev)await page.getByLabel('导入到').selectOption(prev.id)
    await page.getByLabel(word?'Word 文件':'PDF 文件',{exact:true}).setInputFiles(source || {name,mimeType:'application/octet-stream',buffer:files[name]})
    const [rsp]=await Promise.all([page.waitForResponse(r=>r.url()===host.base+prefix+'/imports' && r.request().method()==='POST'),page.getByRole('button',{name:word?'导入 Word':'导入 PDF',exact:true}).click()])
    assert.equal(rsp.status(),201);const receipt=page.getByRole('region',{name:'导入回执'});const digest=sha(files[name]);await receipt.getByText(digest,{exact:true}).waitFor()
    const key=rsp.request().headers()['idempotency-key'];assert.match(key,/^[a-f0-9-]{36}$/)
    // Chrome can evict response bodies. Replay the exact authenticated upload, which must return the existing receipt (200, never 201).
    const h=rsp.request().headers(),headers=Object.fromEntries(Object.entries(h).filter(([k])=>['content-type','idempotency-key','x-knowledgeos-request','x-knowledgeos-filename','x-knowledgeos-asset-id','x-knowledgeos-expected-version'].includes(k)))
    const replay=await owner.request.post(host.base+prefix+'/imports',{headers,data:files[name],maxRedirects:0});const r=await data(replay,200);assert.equal(r.title,name);assert.equal(r.sha256,digest);assert.equal(r.version,(prev?.version??0)+1)
    if(prev){assert.equal(r.id,prev.id);assert.notEqual(r.version_id,prev.version_id)}
    assert.equal(await receipt.getByRole('link').count(),word?1:2)
    if(!word)await clickPreview(receipt.getByRole('link',{name:'查看原件'}),vpath(r)+'/original')
    log('import',{name,asset:r.id,version:r.version_id,sha256:r.sha256});return r
  }
  async function bytes(ctx,path,disposition){const res=await get(ctx,path);assert.equal(res.status(),200);assert.equal(res.headers()['content-disposition'].split(';')[0],disposition);return res.body()}
  async function original(r){assert.deepEqual(await bytes(owner,vpath(r)+'/original?download=1','attachment'),files[r.title])}
  async function conversions(ctx,r){const d=await data(await get(ctx,office(r)));assert.equal(d.version_id,r.version_id);return d.conversions}
  const choose=r=>page.getByLabel('Word 版本',{exact:true}).selectOption(r.version_id)
  async function convert(r,rev){
    await original(r);await choose(r);const path=office(r)
    const [start]=await Promise.all([page.waitForResponse(res=>res.url()===host.base+path+'/start'),page.getByRole('button',{name:'开始转换',exact:true}).click()]);assert.equal(start.status(),202)
    const replay=await owner.request.post(host.base+path+'/start',{headers:{'x-knowledgeos-request':'1','idempotency-key':start.request().headers()['idempotency-key']},maxRedirects:0});const job=await data(replay,200);assert.equal(job.replayed,true)
    const ready=await until(async()=>{const c=(await conversions(owner,r)).find(c=>c.id===job.id);assert(c && ['queued','running','ready'].includes(c.state));return c.state==='ready'&&c},'Office publication',180000)
    assert.equal(ready.page_count,1);assert.deepEqual(ready.notes,[]);const pdf=path+'/'+ready.id+'/pdf'
    await page.getByRole('link',{name:'预览转换 PDF'}).waitFor();await clickPreview(page.locator('#office-preview'),pdf)
    const rendered=await bytes(owner,pdf,'inline');assert.notEqual(sha(rendered),sha(files['a08-reference.pdf']))
    const label='v'+rev+'-'+r.version_id;const facts=inspect(rendered,rev,join(out,'word-'+label+'.png'));log('rendered-result',{version:r.version_id,conversion:ready.id,...facts})
    const body='Test observation: page 1, Quartz '+(rev===1?'17':'29')+'; code indentation '+facts.code_indent_pt+' pt; gold upper-right quadrant.'
    await page.getByLabel('页码').fill('1');await page.getByLabel('质量问题').fill(body);await page.getByRole('button',{name:'保存质量记录'}).click()
    await page.getByText('第 1 页：'+body,{exact:true}).waitFor();const [note]=(await conversions(owner,r)).find(c=>c.id===job.id).notes
    assert.equal(note.page,1);assert.equal(note.body,body);assert(note.id)
    const shot=await page.locator('#office').screenshot({path:join(out,'review-'+label+'.png')});log('review-note',{note_id:note.id,page:1,png_sha256:sha(shot)})
    return {r,cid:job.id,pdf,digest:sha(rendered),note}
  }
  async function durable(v){
    await original(v.r);const c=(await conversions(owner,v.r)).find(c=>c.id===v.cid);assert.equal(c.state,'ready');assert.deepEqual(c.notes,[v.note])
    for(const [suffix,disp] of [['','inline'],['?download=1','attachment']])assert.equal(sha(await bytes(owner,v.pdf+suffix,disp)),v.digest)
    await openLibrary();await choose(v.r);await page.getByText('第 1 页：'+v.note.body,{exact:true}).waitFor();assert.equal(await page.locator('#office-preview').getAttribute('href'),v.pdf)
    const db=new DatabaseSync(dbPath(host.data),{readOnly:true});try{
      const row=db.prepare('SELECT v.blob_id AS source,c.result_blob_id AS result,b.sha256 AS digest FROM asset_versions v JOIN office_conversions c ON c.version_id=v.id JOIN blobs b ON b.id=c.result_blob_id WHERE v.id=? AND c.id=?').get(v.r.version_id,v.cid)
      assert(row && row.source!==row.result);assert.equal(row.digest,v.digest);log('durable-objects',{version:v.r.version_id,source_blob:row.source,result_blob:row.result,sha256:v.digest})
    }finally{db.close()}
  }
  async function noAccess(ctx,v,status,readOnly=false){
    const reads=[vpath(v.r)+'/original?download=1',v.pdf+'?download=1'];if(!readOnly)reads.push(office(v.r),v.pdf)
    for(const path of reads)await denied(await get(ctx,path),status)
    for(const [tail,body] of [['/start'],['/'+v.cid+'/cancel'],['/'+v.cid+'/notes',{page:1,body:'must not persist'}]])
      await denied(await post(ctx,office(v.r)+tail,body),status)
    log('acl-denial',{role:ctx===anon?'anonymous':readOnly?'read-only':'ungranted',status,reads:reads.length,writes:3})
  }
  async function grantCase(readerId){
    // Library intake publishes only personal objects. Prepare a separate project asset in the
    // isolated fixture DB. Never change scope on the private T01 material or seed any ACL rows.
    const project=await data(await post(owner,prefix+'/projects',{name:'A08 ACL fixture'}),201)
    assert.equal((await post(owner,prefix+'/projects/'+project.id+'/memberships',{user_id:readerId,role:'member'})).status(),204)
    const obj=await data(await post(owner,prefix+'/objects',{scope:'project',project_id:project.id,object_type:'asset',title:'ACL fixture',body:'Synthetic project asset for read and revoke checks.'}),201)
    const seed=await upload('a08-v1.docx');const db=new DatabaseSync(dbPath(host.data))
    try{
      db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');assert.equal(db.prepare('SELECT scope_kind,project_id FROM knowledge_objects WHERE id=?').get(obj.id).project_id,project.id)
      db.prepare('INSERT INTO assets(id) VALUES(?)').run(obj.id)
      assert.equal(db.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=? AND version=1').run(obj.id,seed.version_id,seed.id).changes,1)
      db.exec('COMMIT')
    }finally{db.close()}
    log('test-fixture-project-association',{asset:obj.id,version:seed.version_id,grants_seeded:0})
    await openLibrary();const sample=await convert({...seed,id:obj.id},1), before=await conversions(owner,sample.r)
    await noAccess(reader,sample,404)
    const grant=await data(await post(owner,prefix+'/grants',{object_id:obj.id,subject_type:'user',subject_id:readerId,action:'read'}),201)
    assert(grant.id);const issuedLocator=sample.pdf
    try{
      assert.deepEqual(await conversions(reader,sample.r),before);assert.equal(sha(await bytes(reader,issuedLocator,'inline')),sample.digest)
      await noAccess(reader,sample,404,true);log('read-grant-exercised',{preview_sha256:sample.digest})
    }finally{assert.equal((await post(owner,prefix+'/grants/revoke',{grant_id:grant.id})).status(),204)}
    await denied(await get(reader,issuedLocator),404);await noAccess(reader,sample,404);assert.deepEqual(await conversions(owner,sample.r),before)
    await durable(sample);log('revoked-locator-denied-owner-still-readable')
  }
  async function endSession(){
    writeFileSync(join(session.io,'end-origin'),'',{flag:'wx'});const end=await observe(session.io,'disposed',boot.pid)
    assert.equal(end.session,origin.session);assert.notEqual(end.fresh_session,origin.session);assert(end.live_lookup_absent && end.office_temp_absent)
    log('same-process-session-disposal',{pid:end.pid,source_session_sha256:sha(end.session),fresh_session_sha256:sha(end.fresh_session),office_witness_removed:true})
  }
  try{
    report.helpers=freeze(candidate);const {acceptanceSamples}=await import('./acceptance-samples.mjs');files=acceptanceSamples()
    report.fixtures=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v)]))
    const harness=await import('../lib002/a07-isolated-host.mjs');until=harness.until;host=await harness.isolate(candidate,hash)
    report.binding=host.facts;assert.equal(host.facts.candidate_sha,candidate);assert.equal(host.facts.entry_sha256,hash)
    const probe=await import('./host-session.mjs');observe=probe.observe;session=probe.installProbe(host.data,files['a08-v1.docx'])
    phase('isolated Host and real source Session');boot=await host.start();origin=await observe(session.io,'origin',boot.pid)
    assert.equal(origin.input_sha256,sha(files['a08-v1.docx']));log('session-source',{pid:boot.pid,input_sha256:origin.input_sha256,witness_sha256:origin.witness_sha256})
    if(smoke){await endSession();report.diagnostic='SESSION_SMOKE_PASS'}else{
      const {entryCookie}=await import('../fnd003/harness.mjs');const {api,dbPath:db}=await import('../fnd004/harness.mjs');dbPath=db
      const token=(await entryCookie(boot.entry)).cookie;assert(token);const suffix=randomUUID().slice(0,8),a='alice'+suffix,b='bob'+suffix,ap=randomUUID(),bp=randomUUID()
      for(const [route,cookie,login_name,password] of [['bootstrap',token,'admin'+suffix,randomUUID()],['register','',a,ap],['register','',b,bp]]){
        assert.equal((await api(host.port,cookie,'POST',prefix+'/auth/'+route,{login_name,display_name:login_name,password})).status,201)
      }
      const {chromium}=await import(pathToFileURL(host.playwright).href);browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']})
      owner=await browser.newContext();reader=await browser.newContext();anon=await browser.newContext();page=await login(owner,a,ap);await login(reader,b,bp)
      const readerId=(await data(await get(reader,prefix+'/me'))).id;assert(readerId);assert.deepEqual((await data(await get(owner,assets))).items,[]);log('fresh-accounts',{chrome:browser.version()})
      active='T01';phase('source Session upload and separate reference PDF');const v1=await upload('a08-v1.docx',null,session.source),ref=await upload('a08-reference.pdf')
      await original(ref);const reference=await bytes(owner,vpath(ref)+'/original','inline');assert.deepEqual(reference,files[ref.title]);log('reference-preview',inspect(reference,1,join(out,'reference.png')))
      phase('V1 conversion and quality annotation');const first=await convert(v1,1);await durable(first)
      phase('dispose original Session without restarting Host');await endSession();await owner.close();owner=await browser.newContext();page=await login(owner,a,ap)
      await durable(first);await original(ref);log('fresh-client-read-after-disposal',{pid:boot.pid})
      phase('append V2 on the same material');const v2=await upload('a08-v2.docx',v1),second=await convert(v2,2);assert.notEqual(first.cid,second.cid);assert.notEqual(first.digest,second.digest)
      phase('restart same durable profile');await host.stop();const next=await host.start();assert.notEqual(next.pid,boot.pid);log('distinct-host-restart',{old_pid:boot.pid,new_pid:next.pid})
      await owner.close();owner=await browser.newContext();page=await login(owner,a,ap);await durable(first);await durable(second);await original(ref);assert.deepEqual(pageErrors,[]);report.scope.T01='PASS';save()
      active='A08';phase('known private locators, grant and revocation');for(const v of [first,second]){
        const before=await conversions(owner,v.r);await noAccess(anon,v,401);await noAccess(reader,v,404);assert.deepEqual(await conversions(owner,v.r),before)
      }
      await grantCase(readerId);await original(ref);await durable(first);assert.deepEqual(pageErrors,[])
    }
    assert.deepEqual(freeze(candidate),report.helpers);await browser?.close();browser=undefined;await host.stop()
    if(!smoke)report.scope.A08=report.status='PASS'
  }catch(e){process.exitCode=1;report.status=active?'FAIL':'BLOCKED';if(active)report.scope[active]=report.status
    // No raw exceptions, cookies, config, entry URLs, DB rows, stdout or credentials in evidence.
    report.failure={step,type:e.name,line:String(e.stack).match(/(?:host-acceptance|host-session|a07-isolated-host|candidate-live-binding)\.mjs:\d+/)?.[0]}
  }finally{try{await browser?.close()}finally{try{await host?.stop()}finally{save();console.log(report.diagnostic??report.status,report.failure??'',join(out,'summary.json'))}}}
}
