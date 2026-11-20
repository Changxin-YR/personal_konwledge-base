// Usage: node scripts/lib005/host-browser.mjs <candidate SHA> <entry SHA-256> [evidence directory]
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {isolate} from '../lib002/a07-isolated-host.mjs'
import {api} from '../fnd004/harness.mjs'
import {entryCookie} from '../fnd003/harness.mjs'
import {acceptanceSamples,zip} from '../lib004/acceptance-samples.mjs'

const [candidate,hash,parent=tmpdir()]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url))
assert.match(candidate,/^[0-9a-f]{40}$/);assert.match(hash,/^[0-9a-f]{64}$/)
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root}),sha=b=>createHash('sha256').update(b).digest('hex')
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
assert.equal(git('status','--porcelain','--untracked-files=all','--','scripts/lib005','scripts/lib004').length,0)
const helpers=Object.fromEntries(['scripts/lib005/host-browser.mjs','scripts/lib004/acceptance-samples.mjs'].map(p=>{const h=sha(readFileSync(join(root,p)));assert.equal(h,sha(git('show',candidate+':'+p)));return [p,h]}))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'browser-')),report={candidate,entry_sha256:hash,helpers,status:'NOT_RUN',screenshots:[]}
let host,browser,step='bind';const errors=[]
try{
  host=await isolate(candidate,hash);const boot=await host.start();report.host_pid=boot.pid
  const name='browser'+randomUUID().slice(0,8),password=randomUUID(),cookie=(await entryCookie(boot.entry)).cookie
  step='create isolated accounts';for(const [action,who,pass,k] of [['bootstrap','admin'+randomUUID().slice(0,8),randomUUID(),cookie],['register',name,password,'']]){
    assert.equal((await api(host.port,k,'POST','/knowledge/v1/auth/'+action,{login_name:who,display_name:who,password:pass})).status,201)
  }
  const {chromium}=await import(pathToFileURL(host.playwright));browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.chrome=browser.version()
  const ctx=await browser.newContext({viewport:{width:1040,height:920},serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',()=>errors.push('page error'))
  const snap=async name=>{const file=name+'.png',png=await p.locator('#zip').screenshot({path:join(out,file)});report.screenshots.push({file,sha256:sha(png)})}
  step='sign in';await p.goto(host.base+'/knowledgeos/account');await p.locator('#login_name').fill(name);await p.locator('#login_password').fill(password);await p.locator('#login').click();await p.locator('#profile').waitFor()
  const open=async()=>{await p.goto(host.base+'/knowledgeos/library');await p.locator('#mode').selectOption('zip')}
  const pdf=acceptanceSamples()['a08-reference.pdf'],text=Buffer.from('Synthetic selection.'),archive=zip({'docs/review.pdf':pdf,'notes.md':text,'leave.txt':'not imported','other.bin':'unsupported'})
  const post=async(button,path)=>{const [response]=await Promise.all([p.waitForResponse(r=>r.url()===host.base+path&&r.request().method()==='POST'),p.locator(button).click()]);assert(response.ok(),String(response.status()));return (await response.json()).data}
  const listing=async()=>(await(await ctx.request.get(host.base+'/knowledge/v1/assets')).json()).data.items
  step='preview';await open();await p.locator('#file').setInputFiles({name:'review.zip',mimeType:'application/zip',buffer:archive});const manifest=await post('#submit','/knowledge/v1/imports');await p.locator('#zip-panel').waitFor()
  assert.equal(manifest.sha256,sha(archive));assert.deepEqual(await listing(),[]);assert.equal(await p.locator('#zip-entries li').count(),4)
  const box=path=>p.getByRole('checkbox',{name:path,exact:true});assert.equal(await box('other.bin').isEnabled(),false);await box('docs/review.pdf').check();await box('notes.md').check();await snap('preview')
  step='publish selection';const m=await post('#zip-commit','/knowledge/v1/imports/'+manifest.id+'/selection');await p.locator('#zip-entries .entry').nth(1).waitFor();assert.deepEqual(m.entries.map(x=>x.state),['imported','imported','available','available']);assert.equal((await listing()).length,2)
  for(const [i,bytes] of [pdf,text].entries()){const e=m.entries[i];assert.equal(e.receipt.sha256,sha(bytes));const link=p.locator('#zip-entries li').nth(i).locator('a[download]'),path=await link.getAttribute('href');const result=await ctx.request.get(new URL(path,host.base).href);assert.equal(result.status(),200);assert.deepEqual(await result.body(),bytes)}
  await snap('selected');step='reopen';await open();await p.locator('#zip-resume').selectOption(manifest.id);await p.locator('#zip-entries .entry').nth(1).waitFor();assert.equal(await box('docs/review.pdf').isEnabled(),false);assert.equal(await box('leave.txt').isChecked(),false)
  await p.setViewportSize({width:375,height:800});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('resumed-mobile');assert.deepEqual(errors,[])
  report.manifest={sha256:manifest.sha256,entries:4,published:m.entries.filter(e=>e.receipt).map(e=>({title:e.receipt.title,sha256:e.receipt.sha256,version_id:e.receipt.version_id}))};report.status='PASS'
}catch(e){report.status='FAIL';report.failure={step,type:e.name};throw e}
finally{try{await browser?.close();await host?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,step,out)}}
