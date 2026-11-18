#!/usr/bin/env node
/** Real SQLite transactions and controlled fault seams. No model calls. */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
const out=resolve(process.argv[2]??'docs/evidence/FND-005/runs/storage'),root=mkdtempSync(resolve('.cache/fnd005-storage-'));mkdirSync(out,{recursive:true})
const report={category:'REAL_SQLITE_WITH_CONTROLLED_FAULT_SEAMS',started_at:new Date().toISOString(),status:'PASS',checks:[]}
const check=async(id,fn)=>{const at=new Date().toISOString();try{const facts=await fn();report.checks.push({id,status:'PASS',started_at:at,facts});console.log(id+' PASS')}catch(e){report.status='FAIL';report.checks.push({id,status:'FAIL',error:e.message});console.log(id+' FAIL '+e.message)}}
const path=d=>join(d,'knowledgeos.sqlite'),facts=d=>lib.readDatabaseFacts(path(d))
await check('T09.v4-upgrade-preserves-historical-sql-and-ledger',()=>{
 const dir=join(root,'v4');mkdirSync(dir);const db=new DatabaseSync(path(dir));
 for(let i=1;i<=4;i++){db.exec(lib[`MIGRATION_V${i}_SQL`]);if(i===2)db.prepare('INSERT INTO service_identity VALUES (1,?,NULL,NULL)').run('synthetic-service');db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(i,lib[`MIGRATION_V${i}_CHECKSUM`],'2026-01-01T00:00:00.000Z')}
 db.exec(`PRAGMA application_id=${lib.APPLICATION_ID}; PRAGMA user_version=4`);db.close();const before=facts(dir)
 const store=new lib.ProbeStorage({dataDir:dir});assert(store.available,store.failure?.message);store.close();const after=facts(dir);assert.equal(after.userVersion,5);assert.deepEqual(after.ledger.slice(0,4),before.ledger);assert.equal(after.ledger[4].checksum,lib.MIGRATION_V5_CHECKSUM)
 return {before:4,after:5,historical_checksums_unchanged:true,ledger_count:5}
})
await check('T09.v5-migration-fault-rolls-back',()=>{
 const dir=join(root,'migration-fault'),store=new lib.ProbeStorage({dataDir:dir,failureAt:'v5:after-schema'});assert.equal(store.available,false);store.close();const failed=facts(dir);assert.equal(failed.userVersion,4);assert.equal(failed.ledger.length,4);assert(!failed.tables.includes('ai_tool_mutations'))
 const recovered=new lib.ProbeStorage({dataDir:dir});assert(recovered.available);recovered.close();assert.equal(facts(dir).userVersion,5);return {fault_version:4,receipt_table_absent:true,recovery_version:5}
})
await check('T09.forged-schema-rejected-without-rewrite',()=>{
 const dir=join(root,'forged'),s=new lib.ProbeStorage({dataDir:dir});s.close();const db=new DatabaseSync(path(dir));db.exec('ALTER TABLE ai_tool_mutations ADD COLUMN forged TEXT');db.close();const before=createHash('sha256').update(readFileSync(path(dir))).digest('hex');const bad=new lib.ProbeStorage({dataDir:dir});assert.equal(bad.available,false);assert.equal(bad.failure.code,'STORAGE_INCOMPATIBLE');bad.close();assert.equal(createHash('sha256').update(readFileSync(path(dir))).digest('hex'),before);return {code:'STORAGE_INCOMPATIBLE',unchanged:true}
})
let store,identity,dir,actor,object
try{
 dir=join(root,'business');store=new lib.ProbeStorage({dataDir:dir});identity=new lib.IdentityService(store)
 await identity.bootstrap({loginName:'admin',displayName:'合成管理员',password:'synthetic admin password 2026!'})
 const login=await identity.login({loginName:'admin',password:'synthetic admin password 2026!',source:'fnd005-storage'});actor=identity.actor(login.token);assert(actor)
 object=store.createObject({id:randomUUID(),serviceId:actor.serviceId,spaceId:actor.personalSpaceId,scope:'personal',ownerUserId:actor.userId,objectType:'note',title:'synthetic storage',body:'baseline',now:new Date().toISOString()})
 await identity.close();identity=undefined;store.close()
 await check('T05.update-and-receipt-atomic-rollback',()=>{
  const s=new lib.ProbeStorage({dataDir:dir,failureAt:'ai:after-update'});assert(s.available);assert.throws(()=>s.mutateObjectOnce(actor,{objectId:object.id,expectedRevision:1,body:'must roll back',key:'fault-key',digest:'synthetic-digest'},new Date().toISOString()));s.close()
  const db=new DatabaseSync(path(dir),{readOnly:true});assert.equal(db.prepare('SELECT revision FROM knowledge_objects WHERE id=?').get(object.id).revision,1);assert.equal(db.prepare('SELECT count(*) n FROM ai_tool_mutations').get().n,0);db.close();return {revision:1,receipt_rows:0,atomic_rollback:true}
 })
 await check('T04.fresh-auth-clock-after-real-lock-wait',async()=>{
  const s=new lib.ProbeStorage({dataDir:dir});const expires=new Date(Date.now()+120).toISOString();let db=new DatabaseSync(path(dir));db.prepare('UPDATE auth_sessions SET expires_at=? WHERE id=?').run(expires,actor.sessionId);db.close()
  // Worker commits its write lock after the session expires. Main thread truly blocks in BEGIN.
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData);db.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');setTimeout(()=>{db.exec('COMMIT');db.close();},190)`,{eval:true,workerData:path(dir)})
  await new Promise((r,j)=>{worker.once('message',r);worker.once('error',j)});const started=Date.now(),beforeWait=new Date().toISOString();const r=s.mutateObjectOnce(actor,{objectId:object.id,expectedRevision:1,body:'must reject',key:'lock-key',digest:'lock'},beforeWait);const elapsed=Date.now()-started;assert.equal(r.kind,'session_expired');assert(elapsed>=100);s.close();await new Promise(r=>worker.once('exit',r));return {lock_wait_ms:elapsed,session_expired_before_lock_release:true,result:r.kind,no_write:true}
 })
 await check('T09.bounded-lock-and-transaction-regression',()=>{
  const s=new lib.ProbeStorage({dataDir:dir}),db=new DatabaseSync(path(dir));db.exec('BEGIN IMMEDIATE');const started=Date.now();assert.throws(()=>s.mutateObjectOnce(actor,{objectId:object.id,expectedRevision:1,body:'busy',key:'busy',digest:'busy'},new Date().toISOString()),e=>e.code==='STORAGE_BUSY');const elapsed=Date.now()-started;assert(elapsed<1500);db.exec('ROLLBACK');db.close();const r=s.testOnlyTransactionFailure({firstId:'a',failingId:'a',firstKey:'a',failingKey:'b',content:'synthetic rollback'});assert(r.rolledBack&&r.rows===0);s.close();return {busy_timeout_ms:lib.BUSY_TIMEOUT_MS,observed_ms:elapsed,rollback:r}
 })
}catch(e){report.status='FAIL';report.error=e.message}finally{await identity?.close();store?.close()}
report.finished_at=new Date().toISOString();writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='PASS')process.exitCode=1
