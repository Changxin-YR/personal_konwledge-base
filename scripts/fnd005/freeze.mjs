#!/usr/bin/env node
/** Candidate source, loaded bundle and fixed-runtime provenance, without secret config. */
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs'
import { resolve,join,relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root=resolve('.'),git='C:/Users/27363/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'
const run=(cwd,args)=>{const r=spawnSync(git,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});assert.ifError(r.error);assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?e.name==='node_modules'?[]:walk(join(d,e.name)):[join(d,e.name)])
const paths=[...walk('packages/knowledgeos-panel/src'),...walk('packages/knowledgeos-panel/lib'),...walk('scripts/fnd005'),'packages/knowledgeos-panel/build.mjs','packages/knowledgeos-panel/package.json','packages/knowledgeos-panel/package-lock.json','packages/knowledgeos-panel/cordis.patch.yml','scripts/verify-plan.mjs','scripts/test-verify-plan.mjs','scripts/fnd003/harness.mjs','scripts/fnd004/harness.mjs','config/upstream.lock.json','CODEX_START.md','AGENTS.md'].filter(existsSync).sort()
const candidateFiles=Object.fromEntries(paths.map(p=>[p.replaceAll('\\','/'),sha(p)]))
const runtime=resolve('.cache/build/dsh-39163dd'),upstream=resolve('.cache/upstream/deepseek-harness'),upstreamHead=run(upstream,['rev-parse','HEAD']);assert.equal(upstreamHead,'39163dd30f703a79079e2d2446545cff3c453738')
const sourcePaths=run(upstream,['ls-files']).split('\n').filter(p=>/\.(ts|tsx|js|mjs|cjs|json|yml|yaml|cpp|cc|h|rs)$/.test(p)),changes=[];let same=0,missing=0
for(const p of sourcePaths){const original=join(upstream,p),built=join(runtime,p);if(!existsSync(original))continue;if(!existsSync(built)){missing++;continue}try{const a=sha(original),b=sha(built);if(a===b)same++;else changes.push({path:p,upstream_sha256:a,runtime_sha256:b})}catch{missing++}}
const runtimePaths=['package.json','pnpm-lock.yaml','packages/llm/llm/src/index.ts','packages/llm/llm/lib/index.js','packages/core/tools/src/index.ts','packages/core/tools/src/pipeline.ts','packages/core/tools/src/batch.ts','packages/core/tools/lib/index.js','packages/core/tool-executor-native/src/index.ts','packages/core/tool-executor-native/lib/index.js','apps/cli/src/bin.ts','packages/bundle/base/cordis.patch.yml','packages/bundle/web-app/cordis.patch.yml']
const runtimeFiles=Object.fromEntries(runtimePaths.filter(p=>existsSync(join(runtime,p))).map(p=>[p,sha(join(runtime,p))]))
const id='FND-005-'+createHash('sha256').update(JSON.stringify({candidateFiles,runtimeFiles,changes})).digest('hex').slice(0,16)
const manifest={candidate_id:id,frozen_at:new Date().toISOString(),git:{branch:run(root,['branch','--show-current']),head:run(root,['rev-parse','HEAD']),base:'4282b9231a4ac38b0eb87145c337b811aec033e4',status:run(root,['status','--porcelain']).split('\n')},candidate_files:candidateFiles,runtime_files:runtimeFiles,fixed_upstream:{commit:upstreamHead,version:'0.2.2-rc.3',source_files_matched:same,missing_source_paths:missing,source_differences:changes},instruction_sha256:sha('CODEX_START.md'),node:process.version,real_provider_status:'BLOCKED',notes:['candidate_id binds product/test sources and runtime files; acceptance reports may be added after freeze.','Explicit client commit metadata is supplemented by actual source comparison and loaded-bundle hashes.','No credential files, cookies, private data or raw Host logs are included.']}
writeFileSync('docs/evidence/FND-005/candidate.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({candidate_id:id,files:paths.length,runtime:runtimePaths.length,source_files_matched:same,source_differences:changes.map(c=>c.path),missing}));
