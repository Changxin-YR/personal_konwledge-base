import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,realpathSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {sha} from './candidate-live-guards.mjs'
export const root=fileURLToPath(new URL('../../',import.meta.url)), pkg='packages/knowledgeos-panel'
const git=(cwd,...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd()
const pin='39163dd30f703a79079e2d2446545cff3c453738'
export function binding(candidate,cache) {
  assert.match(candidate,/^[a-f0-9]{40}$/); assert.equal(git(root,'rev-parse','HEAD'),candidate)
  const scope=[pkg,'scripts/fnd005','config/upstream.lock.json','docs/evidence/FND-005/candidate.json']
  assert.equal(git(root,'status','--porcelain','--untracked-files=all','--',...scope),'')
  for(const row of git(root,'ls-tree','-r',candidate,'--',...scope).split('\n')) {
    const [,oid,path]=/^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/.exec(row)
    const b=readFileSync(join(root,path)),blob=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'); assert.equal(blob,oid)
  }
  const upstream=join(cache,'upstream/deepseek-harness'), runtime=realpathSync(join(cache,'build/dsh-39163dd'))
  const lock=JSON.parse(readFileSync(join(root,'config/upstream.lock.json'))).upstream
  assert.equal(pin,lock.commit); assert.equal(git(upstream,'rev-parse','HEAD'),pin); assert.equal(git(upstream,'rev-parse','HEAD^{tree}'),lock.tree)
  const manifest=JSON.parse(readFileSync(join(root,'docs/evidence/FND-005/candidate.json')))
  const hashes={...manifest.runtime_files,'packages/llm/llm-pi-ai/lib/index.js':'84ab9bba4432b54d924a945b73b775bcecc1ddba08e02766add6fde785be6136'}
  for(const [path,digest] of Object.entries(hashes)) assert.equal(sha(readFileSync(join(runtime,path))),digest)
  // Also bind source-loaded CLI boot, price/credential adapter and native registry.
  for(const row of git(upstream,'ls-tree','-r',pin,'--','apps/cli/src','packages/llm/llm-pi-ai/src','packages/llm/llm/src').split('\n')) {
    const [,oid,path]=/blob ([0-9a-f]{40})\t(.+)$/.exec(row); const b=readFileSync(join(runtime,path)); assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),oid)
    hashes[path]=sha(b)
  }
  const entry=realpathSync(join(root,pkg,'lib/index.js')),entryHash=sha(readFileSync(entry)),tree=git(root,'rev-parse',candidate+'^{tree}'),runtimeHash=sha(JSON.stringify(hashes))
  return {entry,runtime,playwright:resolve(cache,'panel-builder/node_modules/playwright/index.mjs'),facts:{candidate_sha:candidate,tree,upstream:pin,runtime_sha256:runtimeHash,entry_sha256:entryHash},fingerprint:sha(JSON.stringify([candidate,tree,pin,runtimeHash,entryHash]))}
}
