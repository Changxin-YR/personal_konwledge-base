// Browser drives the production reader; only synthetic originals and a fresh DSH profile.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {knownPdf} from '../lib002/a07-known-pdf.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {api,dbPath,entryCookie,sql} from '../fnd004/harness.mjs'

const [candidate,entry,parent=tmpdir()]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex')
assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entry,/^[a-f0-9]{64}$/)
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root}),self='scripts/read001/host-browser.mjs';assert.equal(git('rev-parse','HEAD').toString().trim(),candidate);assert.equal(sha(readFileSync(join(root,self))),sha(git('show',candidate+':'+self)))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'read001-chrome-')),report={candidate_sha:candidate,entry_sha256:entry,status:'NOT_RUN',screens:[],steps:[]}
let host,browser,ctx,p,phase='boot';const errors=[],requested=[],password=randomUUID(),prefix='/knowledge/v1'
const observe=page=>{page.on('pageerror',()=>errors.push('uncaught exception'));page.on('request',r=>{const u=new URL(r.url());if(u.pathname.endsWith('/reader')&&u.pathname.startsWith(prefix))requested.push(Number(u.searchParams.get('unit')))})}
async function snap(label){const file=label+'.png',b=await p.screenshot({path:join(out,file)});report.screens.push({file,sha256:sha(b)})}
async function upload(name,media,bytes,prev){const r=await ctx.request.post(host.base+prefix+'/imports',{data:bytes,headers:{'content-type':media,'x-knowledgeos-request':'1','idempotency-key':randomUUID(),'x-knowledgeos-filename':name,...(prev?{'x-knowledgeos-asset-id':prev.id,'x-knowledgeos-expected-version':'1'}:{})}});assert.equal(r.status(),201);return (await r.json()).data}
async function dragLast(word){
  const text=p.locator('#text');await text.scrollIntoViewIfNeeded();const pos=await text.evaluate((e,w)=>{const n=e.firstChild,i=n.textContent.lastIndexOf(w);if(i<0)throw Error('expected phrase missing');const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+w.length);const rect=r.getBoundingClientRect();return {x:rect.left,y:rect.top+rect.height/2,right:rect.right,start:i}},word)
  await p.mouse.move(pos.x+0.25,pos.y);await p.mouse.down();await p.mouse.move(pos.right-0.25,pos.y,{steps:12});await p.mouse.up();assert.equal(await p.evaluate(()=>getSelection().toString()),word);await p.locator('#cite').click();await p.locator('#link').waitFor();const href=await p.locator('#link').getAttribute('href');assert(href);const cid=new URL(href,host.base).searchParams.get('citation');const row=sql(dbPath(host.data),'SELECT start,end FROM citations WHERE id=?',[cid])[0];assert.deepEqual([row.start,row.end],[pos.start,pos.start+word.length]);return new URL(href,host.base).href
}
async function library(){await p.goto(host.base+'/knowledgeos/library');await p.locator('#mode:not([disabled])').waitFor()}
async function follow(link){const href=await link.getAttribute('href');assert(href);const next=await ctx.newPage();observe(next);await next.goto(new URL(href,host.base).href);await p.close();p=next}
try{
  host=await isolate(candidate,entry);const boot=await host.start(),admin=(await entryCookie(boot.entry)).cookie;for(const [ep,cookie,name] of [['bootstrap',admin,'setup'],['register','','reader']])assert.equal((await api(host.port,cookie,'POST',prefix+'/auth/'+ep,{login_name:name,display_name:name,password})).status,201)
  const {chromium}=await import(pathToFileURL(host.playwright));browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.chrome=browser.version();ctx=await browser.newContext({viewport:{width:1100,height:820},serviceWorkers:'block'});ctx.setDefaultTimeout(12000);p=await ctx.newPage();observe(p)
  await p.goto(host.base+'/knowledgeos/account');await p.locator('#login_name').fill('reader');await p.locator('#login_password').fill(password);await p.locator('#login').click();await p.locator('#profile').waitFor()
  phase='text selection';const phrase='\u539f\u6587\u{1f642}',text='# '+phrase+' '+phrase+'\n\n'+Array.from({length:180},(_,i)=>'# Chapter '+i+'\n\nParagraph '+i+'.\n').join('\n'),r=await upload('chapters.md','text/markdown',Buffer.from(text));await library()
  await follow(p.locator('#list a[href*="/knowledgeos/reader"]').first());await p.locator('#text').waitFor();assert.deepEqual(requested,[1]);const url=await dragLast(phrase)
  const v2=await upload('chapters.md','text/markdown',Buffer.from('# replacement'),r);assert.notEqual(v2.version_id,r.version_id);await p.goto(url);await p.locator('#text mark').waitFor();assert.equal(await p.locator('#text mark').textContent(),phrase);assert((await p.locator('#version').innerText()).includes(r.version_id));await snap('old-text-citation')
  phase='bounded viewport';const at=requested.length;await p.locator('#number').fill('95');await p.locator('#jump button:not([type=button])').click();await until(()=>requested.at(-1)===95,'target request');await p.locator('#text').waitFor();assert.deepEqual(requested.slice(at),[95]);assert(await p.locator('#window button').count()<60);report.steps.push({name:phase,requested:[95],visible_controls:await p.locator('#window button').count()})
  phase='PDF original and text-layer highlight';const pdf=await upload('sample.pdf','application/pdf',knownPdf('reader'));const start=await ctx.request.post(host.base+prefix+'/assets/'+pdf.id+'/process',{data:{version_id:pdf.version_id},headers:{'x-knowledgeos-request':'1'}});assert.equal(start.status(),202)
  await until(()=>sql(dbPath(host.data),'SELECT state FROM pdf_pages WHERE version_id=? AND page=2',[pdf.version_id])[0]?.state==='ready','parsed second page',45000)
  await library();await p.locator('#parse-version').selectOption(pdf.version_id);const chapter=p.locator('#parse-pages a[href*="unit=2"]');await chapter.waitFor();await follow(chapter);await p.locator('#original img').waitFor();await p.locator('#structured').click();await p.locator('#text').waitFor();assert.equal(await p.locator('#text').innerText(),'A07 reader page 2');const locator=await dragLast('reader');await p.goto(locator);await p.locator('#paper').click();await p.locator('#original .highlight').first().waitFor();assert((await p.locator('#original img').evaluate(img=>img.complete&&img.naturalWidth>0)));await snap('pdf-fixed-highlight');await p.setViewportSize({width:375,height:800});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('pdf-mobile')
  phase='retry a fixed page after leaving a citation';await until(()=>sql(dbPath(host.data),'SELECT state FROM pdf_pages WHERE version_id=? AND page=3',[pdf.version_id])[0]?.state==='ready','parsed third page',45000)
  const target=host.base+prefix+'/assets/'+pdf.id+'/versions/'+pdf.version_id+'/reader?unit=3';let failed=0
  await p.route(target,r=>{if(failed++)return r.continue();return r.fulfill({status:503})})
  const checkpoint=requested.length;await p.locator('#next').click();await p.getByText(/本处加载失败/).waitFor();assert.equal(await p.locator('#number').inputValue(),'3')
  const response=p.waitForResponse(r=>r.url()===target&&r.status()===200);await p.locator('#refresh').click();await response;await p.locator('#original img').waitFor()
  assert.equal(await p.locator('#number').inputValue(),'3');assert.equal(await p.locator('#original .highlight').count(),0);assert.deepEqual(requested.slice(checkpoint),[3,3]);assert.equal(failed,2)
  report.steps.push({name:phase,source:'real-host-chrome, first target request intercepted',requested:[3,3],statuses:[503,200]});assert.deepEqual(errors,[]);report.status='PASS'
}catch(e){report.status='FAIL';report.failure={phase,type:e.name,line:String(e.stack).match(/host-browser\.mjs:\d+/)?.[0]};process.exitCode=1}
finally{try{await browser?.close();await host?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??'',out)}}
