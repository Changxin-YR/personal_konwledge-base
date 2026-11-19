import { spawnSync,execFileSync } from 'node:child_process'
import { readFileSync,mkdirSync,readdirSync,writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join,resolve } from 'node:path'
import { assert,digest,root } from './common.mjs'
const [tree,indexHash,...selected]=process.argv.slice(2),ids=selected.length?selected:['T01','T02','T03','T04','T05','T06','V6']
assert.match(tree??'',/^[0-9a-f]{40}$/);assert.match(indexHash??'',/^[0-9a-f]{64}$/);assert(ids.every(id=>['T01','T02','T03','T04','T05','T06','V6'].includes(id)))
const scripts=fileURLToPath(new URL('.',import.meta.url)),out=join(root,'docs/evidence/FND-006/independent',tree.slice(0,12)+'-'+Date.now()),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
function verify(){
  assert.equal(git('cat-file','-t',tree),'tree');assert.equal(git('diff','--name-only',tree,'--','packages/knowledgeos-panel','config/upstream.lock.json','CODEX_START.md','AGENTS.md','scripts/fnd003/harness.mjs','scripts/fnd004/harness.mjs'),'');assert.equal(JSON.parse(readFileSync(join(root,'config/execution_state.json'))).active_unit,'FND-006')
  const files={};for(const n of ['lib/index.js','lib/test-support.js','lib/storage.js'])files[n]=digest(readFileSync(join(root,'packages/knowledgeos-panel',n)));assert.equal(files['lib/index.js'],indexHash)
  const runtime=resolve(root,'.cache/build/dsh-39163dd'),pinned='39163dd30f703a79079e2d2446545cff3c453738';assert.equal(git('-C',join(root,'.cache/upstream/deepseek-harness'),'rev-parse','HEAD'),pinned)
  const runner=Object.fromEntries(readdirSync(scripts).filter(x=>x.endsWith('.mjs')).map(n=>[n,digest(readFileSync(join(scripts,n)))]));return {tree,files,runner,pinned,cli_sha256:digest(readFileSync(join(runtime,'apps/cli/src/bin.ts')))}
}
mkdirSync(out,{recursive:true});const report={command:[process.execPath,...process.argv.slice(1)],started:new Date().toISOString(),node:process.version,results:[],status:'BLOCKED'}
try {report.before=verify();for(const id of ids){const args=[join(scripts,'case.mjs'),id,out],r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true,timeout:240000});report.results.push({id,command:[process.execPath,...args],exit:r.status,signal:r.signal,error:r.error?.message});writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2))}
  report.after=verify();assert.deepEqual(report.after,report.before);report.status=report.results.every(r=>r.exit===0)?'PASS':'FAIL'
}catch(e){report.error=e.message}finally{report.ended=new Date().toISOString();report.exit=report.status==='PASS'?0:1;writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status+' '+out);process.exitCode=report.exit}
