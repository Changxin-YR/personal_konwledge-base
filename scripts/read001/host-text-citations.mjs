// Frozen real-Host test: text locators, historical versions and source grant revocation.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {isolate} from '../lib002/a07-isolated-host.mjs'
import {api,dbPath,entryCookie,login,sql} from '../fnd004/harness.mjs'

const [candidate,entry,parent=tmpdir()]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex')
assert.match(candidate,/^[a-f0-9]{40}$/);assert.match(entry,/^[a-f0-9]{64}$/)
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root});assert.equal(git('rev-parse','HEAD').toString().trim(),candidate)
const self='scripts/read001/host-text-citations.mjs',digest=sha(readFileSync(join(root,self)));assert.equal(digest,sha(git('show',candidate+':'+self)))
mkdirSync(resolve(parent),{recursive:true});const out=mkdtempSync(join(resolve(parent),'read001-text-')),report={candidate_sha:candidate,entry_sha256:entry,runner_sha256:digest,status:'NOT_RUN',steps:[]}
let h,phase='bind',user,reader;const prefix='/knowledge/v1',password=randomUUID()
const send=async(who,path,status,body,headers={})=>{const r=await fetch(h.base+prefix+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{cookie:who,'x-knowledgeos-request':'1',...headers},body});assert.equal(r.status,status);if(status===204)return;const j=await r.json();if(status>=400){assert(!('data' in j));return j.code}return j.data}
const add=async(text,prev)=>send(user,'/imports',201,Buffer.from(text),{'content-type':'text/plain','idempotency-key':randomUUID(),'x-knowledgeos-filename':'reading.txt',...(prev?{'x-knowledgeos-asset-id':prev.id,'x-knowledgeos-expected-version':'1'}:{})})
const post=(who,path,status,obj,key)=>send(who,path,status,JSON.stringify(obj),{'content-type':'application/json',...(key?{'idempotency-key':key}:{})})
const step=(name,facts={})=>report.steps.push({name,...facts})
try{
  h=await isolate(candidate,entry);const first=await h.start();const admin=(await entryCookie(first.entry)).cookie
  phase='accounts';for(const [endpoint,who,name] of [['bootstrap',admin,'setup'],['register','','owner'],['register','','reader']])assert.equal((await api(h.port,who,'POST',prefix+'/auth/'+endpoint,{login_name:name,display_name:name,password})).status,201)
  const signIn=async name=>{const r=await login(h.port,name,password);assert.equal(r.response.status,200);assert(r.cookie);return r.cookie};user=await signIn('owner');reader=await signIn('reader')
  phase='fixed text citation';const phrase='\u539f\u6587\u{1f642}',text=phrase+' '+phrase,doc=await add(text),start=text.lastIndexOf(phrase),window=id=>`/assets/${id}/versions/${doc.version_id}/reader?unit=1`
  const block=await send(user,window(doc.id),200);assert.equal(block.state,'ready');assert.equal(block.text,text);assert.equal(block.anchor,sha(text));assert.equal(block.total,1);assert(!('ref' in block));await send(reader,window(doc.id),404)
  const spec={asset_id:doc.id,version_id:doc.version_id,ordinal:1,start,end:text.length,source_hash:block.anchor},key=randomUUID()
  const cite=await post(user,'/citations',201,spec,key),path='/citations/'+cite.id+'/resolve';assert.equal(cite.quote_hash,sha(phrase));assert.deepEqual(await post(user,'/citations',200,spec,key),cite)
  assert.equal(await post(user,'/citations',409,{...spec,start:0,end:phrase.length},key),'IDEMPOTENCY_CONFLICT')
  const resolved=await send(user,path,200);assert.deepEqual(resolved,{...cite,quote:phrase});await send('',path,401);await send(reader,path,404)
  const v2=await add('different source',doc);assert.notEqual(v2.version_id,doc.version_id);assert.deepEqual(await send(user,path,200),resolved)
  assert.equal(await post(user,'/citations',409,{...spec,version_id:v2.version_id},randomUUID()),'CITATION_SOURCE_CHANGED')
  const db=dbPath(h.data);assert.deepEqual(sql(db,'SELECT version_id,start,end,quote_hash FROM citations WHERE id=?',[cite.id]).map(x=>[x.version_id,x.start,x.end,x.quote_hash]),[[doc.version_id,start,text.length,sha(phrase)]])
  step(phase,{version:doc.version_id,new_version:v2.version_id,source_hash:block.anchor,quote_hash:sha(phrase),utf16:[start,text.length]})
  phase='restart';await h.stop();const second=await h.start();assert.notEqual(first.pid,second.pid);user=await signIn('owner');reader=await signIn('reader');assert.deepEqual(await send(user,path,200),resolved);step(phase,{pids:[first.pid,second.pid]})
  phase='current project read grant';const pid=(await post(user,'/projects',201,{name:'Reader ACL fixture'})).id,readerId=(await send(reader,'/me',200)).id
  await post(user,`/projects/${pid}/memberships`,204,{user_id:readerId,role:'member'})
  const object=await post(user,'/objects',201,{scope:'project',project_id:pid,object_type:'asset',title:'Project text',body:'Synthetic source'})
  const fixture=await add(text),testDb=new DatabaseSync(db);try{
    testDb.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');testDb.prepare('INSERT INTO assets VALUES(?)').run(object.id);assert.equal(testDb.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(object.id,fixture.version_id,fixture.id).changes,1);testDb.exec('COMMIT')
  }finally{testDb.close()}
  const shared={...spec,asset_id:object.id,version_id:fixture.version_id},grant=await post(user,'/grants',201,{object_id:object.id,subject_type:'user',subject_id:readerId,action:'read'}),readerKey=randomUUID()
  const issued=await post(reader,'/citations',201,shared,readerKey),target='/citations/'+issued.id+'/resolve';assert.equal((await send(reader,target,200)).quote,phrase)
  await post(user,'/grants/revoke',204,{grant_id:grant.id});assert.equal(await send(reader,target,404),'SOURCE_NOT_FOUND');assert.equal(await post(reader,'/citations',404,shared,readerKey),'SOURCE_NOT_FOUND');assert.equal((await send(user,target,200)).quote,phrase)
  step(phase,{before:200,revoked:404,replayed_after_revocation:404});assert.deepEqual(sql(db,'PRAGMA foreign_key_check'),[]);report.status='PASS'
}catch(e){report.status='FAIL';report.failure={phase,type:e.name,line:String(e.stack).match(/host-text-citations\.mjs:\d+/)?.[0]};process.exitCode=1}
finally{try{await h?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??'',out)}}
