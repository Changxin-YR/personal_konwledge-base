/** CLI has no default live action. See --help. Importing never starts a Host. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { hostSamples } from './host-samples.mjs'

const usage='node --experimental-transform-types scripts/lib005/host-acceptance.mjs --self-test\nnode scripts/lib005/host-acceptance.mjs --run <full candidate SHA> <Host entry SHA256> [evidence directory]'
const root=fileURLToPath(new URL('../../',import.meta.url)), sha=b=>createHash('sha256').update(b).digest('hex')
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const prefix='/knowledge/v1', original=r=>`/assets/${r.id}/versions/${r.version_id}/original?download=1`
const entryPath=id=>`/imports/${id}/entries`, selectionPath=id=>`/imports/${id}/selection`
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,stdio:['ignore','pipe','pipe']})
function frozen(candidate){
  const scopes=['scripts/lib005','scripts/lib004','scripts/lib002','scripts/fnd003','scripts/fnd004','scripts/fnd005']
  assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
  assert.equal(git('status','--porcelain','--untracked-files=all','--',...scopes).length,0)
  const files=git('ls-files','-z','--',...scopes).toString().split('\0').filter(p=>p.endsWith('.mjs'))
  return Object.fromEntries(files.map(p=>{const digest=sha(readFileSync(join(root,p)));assert.equal(digest,sha(git('show',candidate+':'+p)));return [p,digest]}))
}
function inputFacts(s){return Object.fromEntries([s.archive,s.peer,...s.direct,...s.members].map(f=>[f.path??f.name,{sha256:sha(f.bytes),bytes:f.bytes.length}]))}
// A one-request availability fault, confined to the exact synthetic ZIP under
// the fresh harness data root. Never overwrite a concurrently restored file.
async function withoutStagedArchive(dataDir,key,digest,attempt){
  const data=realpathSync(dataDir),sandbox=dirname(data);assert.equal(dirname(sandbox),realpathSync(tmpdir()));assert.match(basename(sandbox),/^kos-a07-[\w-]+$/)
  const dir=join(data,'originals');assert.equal(realpathSync(dir),dir);assert.match(key,/^[a-f0-9-]{36}\.zip$/)
  const file=join(dir,key),held=join(dir,'.a05-held-'+randomUUID());assert.equal(realpathSync(file),file);assert(lstatSync(file).isFile());assert.equal(sha(readFileSync(file)),digest)
  assert(!existsSync(held));renameSync(file,held)
  try{return await attempt()}finally{assert(!existsSync(file));renameSync(held,file);assert.equal(sha(readFileSync(file)),digest)}
}
export async function selfTest(){
  const s=hostSamples();assert.deepEqual(inputFacts(s),inputFacts(hostSamples()))
  // Cross-check only the fixture generator here; live expectations never come from this reader.
  const {inspectZip,readZipMember}=await import('../../packages/knowledgeos-panel/src/host/zip-reader.ts')
  assert.deepEqual(inspectZip(s.archive.bytes).map(e=>[e.path,e.size,e.media]),s.members.map(e=>[e.path,e.bytes.length,e.media]))
  for(const [i,m] of s.members.entries())if(m.media)assert.deepEqual(await readZipMember(s.archive.bytes,i),m.bytes)
  assert.equal(s.direct.length,4);return inputFacts(s)
}

export async function runHostAcceptance({candidate,entryHash,evidenceParent=tmpdir()}){
  assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entryHash,/^[a-f0-9]{64}$/)
  mkdirSync(evidenceParent,{recursive:true});const out=mkdtempSync(join(resolve(evidenceParent),'lib005-http-')),summary=join(out,'summary.json')
  const report={candidate_sha:candidate,entry_sha256:entryHash,node:process.version,http_sqlite:'NOT_RUN',chrome:'NOT_RUN',A05:'NOT_RUN',events:[]}
  const save=()=>writeFileSync(summary,JSON.stringify(report,null,2)+'\n'), log=(event,facts={})=>{report.events.push({event,...facts});save()}
  let host,phase='binding',ready=false,alice,bob,dbFile,sql,observedStatus
  const s=hostSamples(), credentials=()=>({login_name:'a05'+randomUUID().slice(0,8),password:randomUUID()}), a=credentials(),b=credentials()
  const rows=(statement,...params)=>sql(dbFile,statement,params)
  const count=table=>rows('SELECT count(*) AS n FROM '+table)[0].n
  function counts(){return Object.fromEntries(['assets','asset_versions','blobs','jobs','office_conversions','pdf_parse_runs'].map(t=>[t,count(t)]))}
  async function send(cookie,path,expected,options={}){
    const res=await fetch(host.base+prefix+path,{...options,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(cookie?{cookie}:{}),...options.headers}})
    observedStatus=res.status;assert([expected].flat().includes(res.status),'unexpected HTTP status');return res
  }
  const data=async response=>{const d=(await (await response).json()).data;assert(d);return d}
  const get=(who,path)=>data(send(who,path,200))
  const upload=(who,f,key=randomUUID(),expected=201)=>data(send(who,'/imports',expected,{method:'POST',headers:{'content-type':f.media,
    'x-knowledgeos-request':'1','idempotency-key':key,'x-knowledgeos-filename':encodeURIComponent(f.name)},body:f.bytes}))
  const select=(who,id,ids,key,expected=200)=>send(who,selectionPath(id),expected,{method:'POST',headers:{'content-type':'application/json',
    'x-knowledgeos-request':'1','idempotency-key':key},body:JSON.stringify({entry_ids:ids})})
  async function originalMatches(who,r,f,owner){
    assert.match(r.id,uuid);assert.match(r.version_id,uuid);assert.equal(r.version,1);assert.equal(r.sha256,sha(f.bytes));assert.equal(r.byte_length,f.bytes.length)
    const res=await send(who,original(r),200);assert.match(res.headers.get('content-disposition')??'',/^attachment\b/i)
    const actual=Buffer.from(await res.arrayBuffer());assert.deepEqual(actual,f.bytes)
    const [v]=rows(`SELECT v.asset_id,v.created_by,v.version,b.sha256,b.byte_length,b.media_type,o.owner_user_id FROM asset_versions v
      JOIN blobs b ON b.id=v.blob_id JOIN knowledge_objects o ON o.id=v.asset_id WHERE v.id=?`,r.version_id)
    assert.deepEqual([v.asset_id,v.created_by,v.version,v.sha256,v.byte_length,v.media_type,v.owner_user_id],[r.id,owner,1,r.sha256,actual.length,f.media,owner])
    log('original',{name:f.path??f.name,asset:r.id,version:r.version_id,sha256:r.sha256,bytes:actual.length})
  }
  function manifest(d,id){
    assert.equal(d.id,id);assert.equal(d.title,s.archive.name);assert.equal(d.sha256,sha(s.archive.bytes));assert.equal(d.byte_length,s.archive.bytes.length)
    assert.equal(d.entries.length,s.members.length);assert.equal(new Set(d.entries.map(e=>e.id)).size,d.entries.length)
    for(const [i,e] of d.entries.entries()){
      const m=s.members[i];assert.match(e.id,uuid);assert.deepEqual([e.name,e.path,e.size,e.compressed_size,e.media_type],[m.path,m.path,m.bytes.length,m.bytes.length,m.media]);assert.equal(e.reason,m.media?null:'ZIP_UNSUPPORTED_MEDIA')
    }
    return d
  }
  async function denial(who,id,chosen,code){
    await (await send(who,entryPath(id),code)).arrayBuffer();await (await select(who,id,chosen,randomUUID(),code)).arrayBuffer()
  }
  try{
    report.helpers=frozen(candidate);report.samples=inputFacts(s);save()
    const {isolate}=await import('../lib002/a07-isolated-host.mjs'),{installProbe,observe}=await import('../lib004/host-session.mjs')
    const h=await import('../fnd004/harness.mjs');sql=h.sql
    host=await isolate(candidate,entryHash);report.binding=host.facts;assert.equal(host.facts.entry_sha256,entryHash);assert.equal(host.facts.candidate_sha,candidate)
    assert.equal(new URL(host.base).hostname,'127.0.0.1');dbFile=h.dbPath(host.data)
    const session=installProbe(host.data,s.direct[1].bytes);phase='isolated Host startup';const first=await host.start(),origin=await observe(session.io,'origin',first.pid)
    assert.equal(origin.input_sha256,sha(s.direct[1].bytes));const admin=(await h.entryCookie(first.entry)).cookie;assert(admin)
    for(const [route,cookie,c] of [['bootstrap',admin,credentials()],['register','',a],['register','',b]]){
      assert.equal((await h.api(host.port,cookie,'POST',prefix+'/auth/'+route,{...c,display_name:c.login_name})).status,201)
    }
    const login=async c=>{const r=await h.login(host.port,c.login_name,c.password);assert.equal(r.response.status,200);assert(r.cookie);return r.cookie}
    alice=await login(a);bob=await login(b);const owner=(await get(alice,'/me')).id,peer=(await get(bob,'/me')).id
    assert.match(owner,uuid);assert.match(peer,uuid);assert.notEqual(owner,peer);assert.equal(count('asset_versions'),0);ready=true
    phase='standalone four formats';const direct=[]
    for(const f of s.direct){
      const fixture=f===s.direct[1]?{...f,bytes:readFileSync(session.source)}:f
      const r=await upload(alice,fixture);await originalMatches(alice,r,f,owner);direct.push(r)
      if(f.media.startsWith('text/')){const d=await get(alice,`/assets/${r.id}/versions/${r.version_id}/blocks`);assert.equal(d.blocks.map(x=>x.text).join(''),f.bytes.toString('utf8'))}
    }
    const sentinel=await upload(bob,s.peer);await originalMatches(bob,sentinel,s.peer,peer)
    phase='manifest without publication';const baseline=counts(),stageKey=randomUUID()
    // A truncated ordinary upload, no unusual paths or expansion fixtures.
    const truncated=await send(alice,'/imports',422,{method:'POST',headers:{'content-type':'application/zip','x-knowledgeos-request':'1','idempotency-key':randomUUID(),'x-knowledgeos-filename':'incomplete.zip'},body:s.archive.bytes.subarray(0,-1)})
    assert.equal((await truncated.json()).code,'ZIP_MALFORMED');assert.equal(count('zip_imports'),0);assert.deepEqual(counts(),baseline)
    const stage=await upload(alice,s.archive,stageKey),id=stage.id;assert.match(id,uuid)
    const staged=manifest(await get(alice,entryPath(id)),id);assert.equal(staged.state,'staged');assert(staged.entries.every(e=>e.state==='available'&&!e.receipt))
    assert.equal((await upload(alice,s.archive,stageKey,200)).id,id);assert.deepEqual(counts(),baseline)
    assert.deepEqual((await get(bob,'/imports')).items,[]);assert.deepEqual((await get(alice,'/imports')).items.map(x=>x.id),[id])
    const ids=staged.entries.map(e=>e.id),chosen=ids.slice(0,3),key=randomUUID()
    await denial('',id,chosen,401);await denial(bob,id,chosen,404)
    assert.equal(count('zip_selections'),0);assert.deepEqual(counts(),baseline);log('manifest',{id,entries:ids.length,counts:baseline})
    phase='partial selection and retry';const firstChild=manifest(await data(select(alice,id,[ids[0]],randomUUID())),id).entries[0].receipt
    await originalMatches(alice,firstChild,s.members[0],owner)
    // Real, benign member-format failure. The archive structure is valid and the PDF is unfinished.
    const partialIds=[ids[0],ids[5]],partialKey=randomUUID();const partial=manifest(await data(select(alice,id,partialIds,partialKey)),id)
    assert.equal(partial.state,'partial');assert.equal(partial.entries[5].state,'failed');assert.match(partial.entries[5].error,/^(?:INVALID_PDF|PDF_INVALID_INPUT)$/)
    assert.deepEqual(partial.entries[0].receipt,firstChild);assert.equal(count('asset_versions'),baseline.asset_versions+1)
    log('recoverable-member-failure',{entry:ids[5],code:partial.entries[5].error,preserved_version:firstChild.version_id})
    phase='dispose source session and restart';writeFileSync(join(session.io,'end-origin'),'',{flag:'wx'});const end=await observe(session.io,'disposed',first.pid)
    assert.equal(end.session,origin.session);assert.notEqual(end.fresh_session,end.session);assert(end.live_lookup_absent&&end.office_temp_absent)
    await host.stop();const second=await host.start();assert.notEqual(first.pid,second.pid);alice=await login(a);bob=await login(b)
    log('session-and-restart',{old_pid:first.pid,new_pid:second.pid,session_disposed:true});assert.equal((await get(alice,'/me')).id,owner);assert.equal((await get(bob,'/me')).id,peer)
    const reopened=manifest(await get(alice,entryPath(id)),id);assert.deepEqual(reopened,partial)
    const retry=manifest(await data(select(alice,id,partialIds,partialKey)),id);assert.deepEqual(retry,partial)
    // Changing a recorded selection requires a new key. Retry with the failed
    // member deselected; the already published PDF keeps its original version.
    const conflict=await select(alice,id,chosen,partialKey,409);assert.equal((await conflict.json()).code,'IDEMPOTENCY_CONFLICT')
    phase='transient failure, then same-key recovery';const [{storage_key}]=rows('SELECT storage_key FROM zip_imports WHERE id=? AND owner_id=?',id,owner)
    const unavailable=await withoutStagedArchive(host.data,storage_key,sha(s.archive.bytes),async()=>{
      const response=await select(alice,id,chosen,key,503);return (await response.json()).code
    })
    assert.equal(unavailable,'ORIGINAL_UNAVAILABLE');assert.equal(count('asset_versions'),baseline.asset_versions+1)
    const interrupted=manifest(await get(alice,entryPath(id)),id);assert.deepEqual(interrupted.entries[0].receipt,firstChild)
    assert.deepEqual(interrupted.entries.slice(1,3).map(x=>x.state),['selected','selected']);log('retryable-source-unavailable',{code:unavailable,pending:chosen.slice(1)})
    const done=manifest(await data(select(alice,id,chosen,key)),id);assert.deepEqual(done.entries[0].receipt,firstChild)
    assert.deepEqual(await data(select(alice,id,chosen,key)),done);assert.deepEqual(await get(alice,entryPath(id)),done)
    phase='durable subset and ACL';const receipts=done.entries.slice(0,3).map(e=>{assert.equal(e.state,'imported');return e.receipt})
    assert.equal(new Set([...direct,...receipts].map(r=>r.id)).size,7)
    const ledger=rows('SELECT id,ordinal,state,error,version_id FROM zip_entries WHERE import_id=? ORDER BY ordinal',id)
    assert.equal(ledger.length,ids.length)
    for(const [i,e] of done.entries.entries()){
      assert.equal(e.id,ids[i]);assert.deepEqual([ledger[i].id,ledger[i].ordinal,ledger[i].state,ledger[i].version_id,ledger[i].error],[e.id,i,e.state,e.receipt?.version_id??null,e.error])
      if(i<3){await originalMatches(alice,e.receipt,s.members[i],owner);await (await send(bob,original(e.receipt),404)).arrayBuffer();await (await send('',original(e.receipt),401)).arrayBuffer()}
      else {assert.equal(e.state,i===5?'failed':'available');assert(!e.receipt)}
    }
    for(const [i,r] of direct.entries())await originalMatches(alice,r,s.direct[i],owner)
    await originalMatches(bob,sentinel,s.peer,peer);await (await send(alice,original(sentinel),404)).arrayBuffer()
    await denial(bob,id,chosen,404);await denial('',id,chosen,401);assert.deepEqual((await get(bob,'/assets')).items.map(r=>r.id),[sentinel.id])
    assert.equal(count('assets'),baseline.assets+3);assert.equal(count('asset_versions'),baseline.asset_versions+3);assert.equal(count('zip_selections'),3)
    const [source]=rows('SELECT owner_id,sha256,byte_length FROM zip_imports WHERE id=?',id)
    assert.deepEqual([source.owner_id,source.sha256,source.byte_length],[owner,sha(s.archive.bytes),s.archive.bytes.length]);assert.deepEqual(rows('PRAGMA foreign_key_check'),[])
    log('subset-and-recovery',{selected:chosen,children:receipts.map(r=>r.version_id),failed:ids[5],unselected:ids.slice(3,5),asset_versions:count('asset_versions')})
    phase='final binding';assert.deepEqual(frozen(candidate),report.helpers);await host.stop();report.http_sqlite='PASS'
  }catch(e){report.http_sqlite=ready?'FAIL':'BLOCKED';report.failure={phase,observed_status:observedStatus,line:String(e.stack).match(/(?:host-acceptance|host-session|a07-isolated-host|candidate-live-binding)\.mjs:\d+/)?.[0]}}
  finally{try{await host?.stop()}catch{report.http_sqlite='FAIL';report.cleanup='Host stop failed'}save()}
  return {status:report.http_sqlite,summary}
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2)
  if(args.length===1&&args[0]==='--self-test'){await selfTest();console.log('Offline fixture checks passed; no Host started.')}
  else if(args.length===1&&args[0]==='--help')console.log(usage)
  else if(args[0]==='--run'&&[3,4].includes(args.length)&&/^[a-f0-9]{40}$/.test(args[1])&&/^[a-f0-9]{64}$/.test(args[2])){
    const result=await runHostAcceptance({candidate:args[1],entryHash:args[2],evidenceParent:args[3]});console.log(result.status,result.summary);if(result.status!=='PASS')process.exitCode=1
  }else{console.error(usage);process.exitCode=2}
}
