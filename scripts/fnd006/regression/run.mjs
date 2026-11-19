#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync,spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,realpathSync,existsSync,readdirSync,copyFileSync } from 'node:fs'
import { dirname,join,relative,resolve } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),base='c03ec437b2c648b16449598f89ac289bf307ccd2'
const [phase,expected,entryHash]=process.argv.slice(2),v=phase==='baseline'?5:6
assert(phase==='baseline'||(phase==='frozen'&&/^[a-f0-9]{40}$/.test(expected)&&/^[a-f0-9]{64}$/.test(entryHash)), 'use frozen <git tree> <entry SHA-256>')
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(readFileSync(p))
const pkg='packages/knowledgeos-panel',profile='.cache/dsh-home-fnd003/profiles/knowledgeos-identity-test',pin='39163dd30f703a79079e2d2446545cff3c453738'
const snapshot=()=>{const paths=git('ls-files','-co','--exclude-standard','-z','--',pkg).split('\0').filter(Boolean).sort();const files=Object.fromEntries(paths.map(p=>[p,fileHash(join(root,p))]));return {head:git('rev-parse','HEAD'),product_sha256:hash(JSON.stringify(files)),entry:realpathSync(join(root,profile,'node_modules/knowledgeos-panel/lib/index.js')),entry_sha256:files[pkg+'/lib/index.js'],dirty_product:git('status','--porcelain','--',pkg),files}}
const before=snapshot();const verifyFrozen=()=>{if(phase==='frozen'){assert.equal(git('cat-file','-t',expected),'tree');assert.equal(git('diff','--name-only',expected,'--',pkg),'');assert.equal(fileHash(before.entry),entryHash);assert.deepEqual(Object.keys(snapshot().files),git('ls-tree','-r','--name-only',expected,'--',pkg).split('\n').sort())}};verifyFrozen()
assert.equal(git('-C','.cache/upstream/deepseek-harness','rev-parse','HEAD'),pin)
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=join(root,'docs/evidence/FND-006/regression',phase+'-'+stamp)
mkdirSync(out,{recursive:true});mkdirSync(join(here,'.cache'),{recursive:true});const work=mkdtempSync(join(here,'.cache/r-'))
const save=(p,s)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,s)}
const link=(p,target)=>{mkdirSync(dirname(p),{recursive:true});symlinkSync(target,p,'junction')}
for(const item of [pkg,'.cache/build/dsh-39163dd','.cache/panel-builder',profile])link(join(work,item),join(root,item))
const report={phase,expected,command:[process.execPath,...process.argv.slice(1)],cwd:root,work,node:process.version,upstream:pin,before,base,scripts:{},suites:[],started_at:new Date().toISOString(),real_model_calls:0}
const replace=(s,from,to)=>{assert.equal(s.split(from).length,2,'expected one historical marker: '+from);return s.replace(from,()=>to)}
for(const p of ['fnd001/status-contract','fnd003/harness','fnd004/harness','fnd005/harness','fnd005/regression-harness','fnd005/fixture-provider','fnd005/acl-regression','fnd005/run-all','fnd005/browser-checks','fnd005/configuration-checks']){
 const file='scripts/'+p+'.mjs';let s=execFileSync('git',['show',(expected??base)+':'+file],{cwd:root,encoding:'utf8'});const original=hash(s)
 if(p==='fnd005/harness'){
  s="import { symlinkSync,realpathSync } from 'node:fs'\n"+s
  const old="cpSync(join(REPO, '.cache/dsh-home-fnd003/profiles', profileName), profile, { recursive: true })"
  s=replace(s,old,"const src=realpathSync(join(REPO,'.cache/dsh-home-fnd003/profiles',profileName));cpSync(src,profile,{recursive:true,filter:p=>p!==join(src,'node_modules','knowledgeos-panel')});symlinkSync(realpathSync(join(src,'node_modules','knowledgeos-panel')),join(profile,'node_modules','knowledgeos-panel'),'junction')")
 }
 if(p==='fnd005/configuration-checks')s=s.replaceAll('prepareRun(out,3133','prepareRun(out,3266')
 if(p==='fnd003/harness')s=replace(s,"['--import', 'tsx/esm'","['--import', "+JSON.stringify(pathToFileURL(join(here,'trace.mjs')).href)+", '--import', 'tsx/esm'")
 if(p==='fnd005/browser-checks') {const mark=" await page.locator('#instruction').fill('读取这个对象');await page.locator('#prepare').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已准备'));await page.locator('#instruction').fill('读取这个对象的新草稿');";s=replace(s,mark,readFileSync(join(here,'ui-reread.inc'),'utf8')+'\n'+mark);s=s.replaceAll('prepareRun(out,3134','prepareRun(out,3264')}
 if(v===6 && p==='fnd005/run-all'){s=replace(s,'assert.equal(facts.userVersion,5);assert.equal(facts.ledger.length,5)','assert.equal(facts.userVersion,6);assert.equal(facts.ledger.length,6)');s=replace(s,'user_version:5,ledger:5','user_version:facts.userVersion,ledger:facts.ledger.length')}
 if(v===6 && p==='fnd005/acl-regression')for(const varName of ['recoveredFacts','v3After','fakeFacts','facts']){const old=varName+'.userVersion === 5 && '+varName+'.ledger.length === 5';s=replace(s,old,old.replaceAll('=== 5','=== 6'))}
 save(join(work,file),s);report.scripts[file]={original,executed:hash(s)}
}
copyFileSync(join(here,'observations.mjs'),join(work,'scripts/fnd005/observations.mjs'))
const env={...process.env,FND006_TRACE:join(work,'loaded.jsonl'),TSX_DISABLE_CACHE:'1'}
for(const k of Object.keys(env))if(/API_KEY|AUTH_TOKEN|DSH_HOME|OPENAI_|DEEPSEEK_|NODE_OPTIONS/i.test(k))delete env[k]
for(const [id,script,opts] of [['ui','browser-checks',[]],['configuration','configuration-checks',[]],['policy','observations',[String(v)]],['integration','run-all',['--port','3263']],['acl','acl-regression',['--port','3265']]]){
 const dest=join(work,'evidence',id),args=['scripts/fnd005/'+script+'.mjs',...(['acl','integration'].includes(id)?['--out']:[]),dest,...opts];const start=new Date().toISOString(),result=spawnSync(process.execPath,args,{cwd:work,env,encoding:'utf8',windowsHide:true,timeout:360000,maxBuffer:8*1024*1024});let details
 if(existsSync(join(dest,'summary.json')))details=JSON.parse(readFileSync(join(dest,'summary.json'),'utf8'));else details={status:'NOT_RUN',error:'no suite summary',diagnostics:(result.stderr||'').replace(/http:\/\/[^\s]+/g,'[redacted]').slice(-1200)}
 const status=result.status===0&&details.status==='PASS'?'PASS':'FAIL';report.suites.push({id,command:[process.execPath,...args],start,end:new Date().toISOString(),exit:result.status,signal:result.signal,status,details});console.log(id,status,result.status)
 if(id==='ui'&&existsSync(dest))for(const name of readdirSync(dest).filter(f=>f.endsWith('.png')))copyFileSync(join(dest,name),join(out,name))
}
report.after=snapshot();report.loads=existsSync(env.FND006_TRACE)?readFileSync(env.FND006_TRACE,'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x)):[];verifyFrozen()
report.stable=report.before.product_sha256===report.after.product_sha256&&report.before.head===report.after.head
report.load_verified=report.loads.length>0&&report.loads.every(x=>x.path===before.entry&&x.sha256===before.entry_sha256)
report.status=report.stable&&report.load_verified&&report.suites.every(s=>s.status==='PASS')?'PASS':'FAIL';report.exit=report.status==='PASS'?0:1;report.finished_at=new Date().toISOString();save(join(out,'run.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,out);process.exitCode=report.exit
