import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root='docs/evidence/FND-005/independent', name=process.argv[2]
const suites={
  integration:['scripts/fnd005/run-all.mjs','--port','3141','--out',root+'/integration'],
  storage:['scripts/fnd005/storage-checks.mjs',root+'/storage'],
  barriers:['scripts/fnd005/barrier-checks.mjs',root+'/barriers'],
  ui:['scripts/fnd005/browser-checks.mjs',root+'/ui'],
  configuration:['scripts/fnd005/configuration-checks.mjs',root+'/configuration'],
  acl:['scripts/fnd005/acl-regression.mjs','--port','3143','--out',root+'/acl','--candidate','FND-005-572a5b58a7b46671'],
  plan:['scripts/verify-plan.mjs'],
  'plan-tests':['scripts/test-verify-plan.mjs'],
  typecheck:['.cache/panel-builder/node_modules/typescript/bin/tsc','-p','packages/knowledgeos-panel/tsconfig.json'],
  additional:[root+'/additional-checks.mjs'],
  'ui-additional':[root+'/ui-additional.mjs'],
  'service-additional':[root+'/service-additional.mjs'],
}
if(!suites[name])throw new Error('Unknown independent suite')
const report={candidate_id:'FND-005-572a5b58a7b46671',command:'node '+suites[name].join(' '),started_at:new Date().toISOString(),timezone:'UTC (Asia/Shanghai = UTC+08:00)'}
const child=spawn(process.execPath,suites[name],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']})
const output={stdout:[],stderr:[]};for(const key of Object.keys(output))child[key].on('data',x=>output[key].push(x))
const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)})
report.exit_code=code;report.finished_at=new Date().toISOString()
report.output_facts=Object.fromEntries(Object.entries(output).map(([key,chunks])=>{const b=Buffer.concat(chunks);return[key,{bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}]}))
report.raw_output_saved=false
mkdirSync(root,{recursive:true});writeFileSync(join(root,'command-'+name+'.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report));if(code!==0)process.exitCode=1
