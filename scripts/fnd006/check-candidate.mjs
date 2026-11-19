/** Offline delivery check. Does not count as a runtime or independent test. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as adapter from '../../packages/knowledgeos-panel/lib/storage.js'

const root=fileURLToPath(new URL('../..',import.meta.url))
const git=(...args)=>execFileSync('git',args,{cwd:root})
const hash=buf=>createHash('sha256').update(buf).digest('hex')
const tree=process.argv[2], base='c03ec437b2c648b16449598f89ac289bf307ccd2'
assert.match(tree??'',/^[0-9a-f]{40}$/)
const pkg='packages/knowledgeos-panel', storage=`${pkg}/src/host/storage.ts`
const files=git('ls-tree','-r','-z','--name-only',tree,'--',pkg).toString().split('\0').filter(Boolean)
const disk=path=>readFileSync(new URL('../../'+path,import.meta.url))
assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','-z','--',pkg).toString().split('\0').filter(Boolean).sort(),[...files].sort())
for(const path of files) assert.deepEqual(disk(path),git('show',`${tree}:${path}`),path)
const previous=git('show',`${base}:${storage}`).toString(), migrations=[]
for(let v=1;v<=5;v++) {
  const field=`MIGRATION_V${v}_SQL`
  const historical=previous.match(new RegExp(field+' = `([^`]+)`'))?.[1]
  assert.equal(typeof historical,'string');assert.equal(adapter[field],historical)
  const checksum=hash(historical);assert.equal(adapter[`MIGRATION_V${v}_CHECKSUM`],checksum)
  migrations.push({version:v,checksum})
}
console.log(JSON.stringify({status:'PASS',type:'static_candidate_binding',tree,base,product_files:files.length,host_sha256:hash(disk(`${pkg}/lib/index.js`)),migrations},null,2))
