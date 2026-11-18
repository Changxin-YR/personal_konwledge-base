import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
const repo=resolve('.'), out=resolve('docs/evidence/FND-005/independent')
const git=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe')
const command=(cwd,args)=>{const r=spawnSync(git,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});assert.ifError(r.error);assert.equal(r.status,0,'git read failed');return r.stdout.trim()}
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const manifestPath=join(repo,'docs/evidence/FND-005/candidate.json'), m=JSON.parse(readFileSync(manifestPath,'utf8'))
const report={candidate_id:m.candidate_id,category:'INDEPENDENT_STATIC_HASH_AND_PROVENANCE',started_at:new Date().toISOString(),manifest_sha256:sha(manifestPath),status:'PASS'}
report.git={head:command(repo,['rev-parse','HEAD']),branch:command(repo,['branch','--show-current']),status:command(repo,['status','--porcelain']).split('\n')}
report.files=[]
for(const [group,root] of [['candidate_files',repo],['runtime_files',join(repo,'.cache/build/dsh-39163dd')]]){
  for(const [path,expected] of Object.entries(m[group])){
    const actual=existsSync(join(root,path))?sha(join(root,path)):null
    report.files.push({group,path,expected,actual,status:actual===expected?'PASS':'FAIL'})
  }
}
const upstream=join(repo,'.cache/upstream/deepseek-harness'), runtime=join(repo,'.cache/build/dsh-39163dd')
report.upstream={head:command(upstream,['rev-parse','HEAD']),tracked_changes:command(upstream,['diff','HEAD','--name-only']),matched:0,missing:[],differences:[]}
for(const path of command(upstream,['ls-files']).split('\n').filter(p=>/\.(ts|tsx|js|mjs|cjs|json|yml|yaml|cpp|cc|h|rs)$/.test(p))){
  if(!existsSync(join(upstream,path)))continue
  if(!existsSync(join(runtime,path))){report.upstream.missing.push(path);continue}
  if(sha(join(upstream,path))===sha(join(runtime,path)))report.upstream.matched++
  else report.upstream.differences.push(path)
}
report.derived_candidate_id='FND-005-'+createHash('sha256').update(JSON.stringify({candidateFiles:m.candidate_files,runtimeFiles:m.runtime_files,changes:[]})).digest('hex').slice(0,16)
if(report.files.some(f=>f.status!=='PASS')||report.git.head!==m.git.head||report.git.branch!==m.git.branch||report.upstream.head!==m.fixed_upstream.commit||report.upstream.tracked_changes||report.upstream.missing.length||report.upstream.differences.length||report.upstream.matched!==m.fixed_upstream.source_files_matched||report.derived_candidate_id!==m.candidate_id)report.status='FAIL'
report.finished_at=new Date().toISOString()
mkdirSync(out,{recursive:true});writeFileSync(join(out,process.argv[2]??'candidate-before.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({candidate_id:report.candidate_id,status:report.status,files:report.files.length,upstream:report.upstream,head:report.git.head,manifest_sha256:report.manifest_sha256}))
if(report.status!=='PASS')process.exitCode=1
