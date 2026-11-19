import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assert,lib,root,seed,causes,digest } from './common.mjs'
const [dir,mode]=process.argv.slice(2)
if(mode==='seed') {
  const bytes=execFileSync('git',['show','c03ec437b2c648b16449598f89ac289bf307ccd2:packages/knowledgeos-panel/lib/test-support.js'],{cwd:root})
  const path=join(dir,'v5-baseline.mjs');writeFileSync(path,bytes)
  const old=await import(pathToFileURL(path));assert.equal(old.SCHEMA_VERSION,5);await seed(old,dir)
  console.log(JSON.stringify({pid:process.pid,baseline_bundle_sha256:digest(bytes)}))
} else {
  assert(['fault','upgrade','reopen'].includes(mode));const s=new lib.ProbeStorage({dataDir:dir,...(mode==='fault'?{failureAt:'v6:after-schema'}:{})})
  try { const chain=causes(s.failure);assert.equal(s.available,mode!=='fault');if(mode==='fault')assert(chain.some(v=>v.includes('v6:after-schema')),chain.join(': '));console.log(JSON.stringify({pid:process.pid,available:s.available,chain})) }
  finally {s.close()}
}
