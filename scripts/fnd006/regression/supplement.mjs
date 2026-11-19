// Repeat affected transaction and native permission checks in a verified frozen mirror.
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..')
const [folder]=process.argv.slice(2);assert(/^frozen-[0-9TZ.-]+$/.test(folder))
const dir=join(root,'docs/evidence/FND-006/regression',folder),main=JSON.parse(readFileSync(join(dir,'run.json'),'utf8')),work=realpathSync(main.work)
assert.equal(dirname(work),realpathSync(join(here,'.cache')));const tree=main.expected,pkg='packages/knowledgeos-panel'
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});const sha=v=>createHash('sha256').update(v).digest('hex')
function verify(){assert.equal(git('diff','--name-only',tree,'--',pkg),'');for(const [p,h] of Object.entries(main.before.files))assert.equal(sha(readFileSync(join(root,p))),h);for(const [p,h] of Object.entries(main.scripts))assert.equal(sha(readFileSync(join(work,p))),h.executed)}
verify();const results=[],env={...process.env,FND006_TRACE:join(work,'supplement-load.jsonl'),TSX_DISABLE_CACHE:'1'}
for(const k of Object.keys(env))if(/API_KEY|AUTH_TOKEN|DSH_HOME|OPENAI_|DEEPSEEK_|NODE_OPTIONS/i.test(k))delete env[k]
for(const name of ['storage-checks','barrier-checks']){
 const file='scripts/fnd005/'+name+'.mjs',src=git('show',tree+':'+file);let s=src
 const sub=(a,b)=>{assert.equal(s.split(a).length,2);s=s.replace(a,b)}
 if(name==='storage-checks'){
 sub('assert.equal(after.userVersion,5)','assert.equal(after.userVersion,6);assert.equal(after.ledger.length,6)');sub('before:4,after:5,historical_checksums_unchanged:true,ledger_count:5','before:4,after:after.userVersion,historical_checksums_unchanged:true,ledger_count:after.ledger.length');sub('assert.equal(facts(dir).userVersion,5)','assert.equal(facts(dir).userVersion,6)');sub('recovery_version:5','recovery_version:facts(dir).userVersion')
 }else sub('prepareRun(out,3135)','prepareRun(out,3267)')
 const dest=join(work,'evidence',name);mkdirSync(dest,{recursive:true});writeFileSync(join(work,file),s);const args=[file,dest],start=new Date().toISOString(),r=spawnSync(process.execPath,args,{cwd:work,env,encoding:'utf8',timeout:180000,windowsHide:true});let details;try{details=JSON.parse(readFileSync(join(dest,'summary.json'),'utf8'))}catch{details={status:'NOT_RUN',error:'missing summary'}}
 results.push({name,original:sha(src),executed:sha(s),command:[process.execPath,...args],cwd:work,start,end:new Date().toISOString(),exit:r.status,details});console.log(name,r.status,details.status)
}
verify();const loads=readFileSync(env.FND006_TRACE,'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x));assert(loads.length&&loads.every(x=>x.sha256===main.before.entry_sha256&&x.path===main.before.entry));const status=results.every(x=>x.exit===0&&x.details.status==='PASS')?'PASS':'FAIL';writeFileSync(join(dir,'supplement.json'),JSON.stringify({tree,command:[process.execPath,...process.argv.slice(1)],loads,stable:true,results,status,exit:status==='PASS'?0:1},null,2)+'\n',{flag:'wx'});process.exitCode=status==='PASS'?0:1
