/** Read-only closure checks; writes only its independent audit record. */
import assert from 'node:assert/strict'
import { readFileSync,readdirSync,writeFileSync } from 'node:fs'
import { join,resolve,relative } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection } from 'node:net'
const root=resolve('docs/evidence/FND-005/independent'),repo=resolve('.')
const json=p=>JSON.parse(readFileSync(join(root,p),'utf8')),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const before=json('candidate-before.json'),after=json('candidate-after.json')
const report={candidate_id:before.candidate_id,category:'INDEPENDENT_STATIC_AND_LOCAL_PORT_CLOSURE',started_at:new Date().toISOString(),status:'PASS',checks:[]}
assert.equal(report.candidate_id,'FND-005-d0ec209b8161e14e')
assert.equal(before.status,'PASS');assert.equal(after.status,'PASS');assert.equal(before.manifest_sha256,after.manifest_sha256)
const git=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe')
const base=spawnSync(git,['show','4282b9231a4ac38b0eb87145c337b811aec033e4:packages/knowledgeos-panel/src/host/storage.ts'],{cwd:repo,encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(base.status,0)
const current=readFileSync('packages/knowledgeos-panel/src/host/storage.ts','utf8')
report.migrations=[]
for(let v=1;v<=4;v++){
 const marker='export const MIGRATION_V'+v+'_SQL = '+String.fromCharCode(96),extract=s=>{const i=s.indexOf(marker);assert(i>=0);const start=i+marker.length,end=s.indexOf(String.fromCharCode(96),start);assert(end>start);return s.slice(start,end)}
 const old=extract(base.stdout),now=extract(current);assert.equal(now,old,'historical migration SQL changed: v'+v)
 const checksum=createHash('sha256').update(now).digest('hex');assert.equal(json('integration/summary.json').schema.find(s=>s.version===v).checksum,checksum)
 report.migrations.push({version:v,status:'PASS',sql_identical_to_accepted_base:true,checksum})
}
report.ports=await Promise.all([3133,3134,3135,3141,3142,3143,3144].map(port=>new Promise(resolvePort=>{
 const c=createConnection({host:'127.0.0.1',port});let done=false;const finish=(released,reason)=>{if(done)return;done=true;c.destroy();resolvePort({port,released,reason})};c.once('connect',()=>finish(false,'listener present'));c.once('error',e=>finish(e.code==='ECONNREFUSED',e.code));c.setTimeout(1000,()=>finish(false,'probe timeout'))
})))
if(report.ports.some(p=>!p.released))report.status='FAIL'
const files=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(d,e.name)):[join(d,e.name)])
report.forbidden_runtime_artifacts=files(root).filter(p=>/\.(?:sqlite(?:-wal|-shm)?|db|log)$/i.test(p)).map(p=>relative(root,p).replaceAll('\\','/'))
if(report.forbidden_runtime_artifacts.length)report.status='FAIL'
report.credential_shaped_json_fields=[]
const inspect=(v,file,path='')=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){const at=path?path+'.'+k:k;if(/^(cookie|authorization|access_token|refresh_token|password|api_key|entryUrl|entry_url|token)$/i.test(k)&&typeof x==='string'&&x&&!/^<redacted>$/.test(x))report.credential_shaped_json_fields.push({file,path:at});if(x&&typeof x==='object')inspect(x,file,at)}}
for(const p of files(root).filter(p=>p.endsWith('.json')))inspect(JSON.parse(readFileSync(p,'utf8')),relative(root,p).replaceAll('\\','/'))
if(report.credential_shaped_json_fields.length)report.status='FAIL'
report.preserved_round1=Object.fromEntries(['REVIEW.md','summary.json','candidate-original.json','command-additional-attempt-2.json','additional/attempt-1-summary.json','additional/attempt-2-summary.json','additional/summary.json','ui-additional/summary.json','ui-additional/target-switch-delayed-read.png'].map(p=>[p,hash(join(root,'round1',p))]))
report.finished_at=new Date().toISOString();writeFileSync(join(root,'final-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,migrations:report.migrations.length,ports:report.ports,credential_fields:report.credential_shaped_json_fields,forbidden_artifacts:report.forbidden_runtime_artifacts}));if(report.status!=='PASS')process.exitCode=1
