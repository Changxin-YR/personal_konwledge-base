import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import * as lib from '../../../packages/knowledgeos-panel/lib/test-support.js'

export { assert, sleep, randomUUID, lib }
export const root = fileURLToPath(new URL('../../../', import.meta.url))
export const digest = value => createHash('sha256').update(value).digest('hex')
export const query = (dir, op) => {
  const db = new DatabaseSync(join(dir,'knowledgeos.sqlite'), {readOnly:true})
  try { db.exec('BEGIN'); return op(db) } finally { db.close() }
}
export const open = (dataDir, failureAt) => {
  const s = new lib.ProbeStorage({dataDir,failureAt}); assert(s.available,s.failure?.message); return s
}
export function snapshot(dir,id) {
  return query(dir, db => {
    const row = db.prepare('SELECT id,state,attempts,checkpoint,lease_token,lease_until,available_at,last_error FROM jobs WHERE id=?').get(id)
    assert(row,'missing job'); row.lease_token = row.lease_token ? digest(row.lease_token) : null
    const rows = stmt => db.prepare(stmt).all(id)
    return { ...row,runs:rows('SELECT * FROM job_runs WHERE job_id=? ORDER BY attempt'),results:rows('SELECT * FROM job_results WHERE job_id=?'),events:rows('SELECT * FROM outbox WHERE job_id=?'),receipts:rows('SELECT r.* FROM event_receipts r JOIN outbox o USING(event_id) WHERE o.job_id=?') }
  })
}
export async function until(read,desc,ms=15000) {
  const end=Date.now()+ms
  while(Date.now()<end) { const value=await read(); if(value)return value; await sleep(20) }
  throw Error('timeout: '+desc)
}
export async function seed(lib,dir) {
  const store=new lib.ProbeStorage({dataDir:dir}), identity=new lib.IdentityService(store)
  try {
    assert(store.available,store.failure?.message)
    const creds={loginName:'synthetic',password:'Synthetic password 2026!'}
    await identity.bootstrap({...creds,displayName:'Synthetic'})
    const login=await identity.login({...creds,source:'isolated'}), actor=identity.actor(login.token); assert(actor)
    const object=store.createObject({id:randomUUID(),serviceId:actor.serviceId,spaceId:actor.personalSpaceId,scope:'personal',ownerUserId:actor.userId,objectType:'note',title:'Synthetic note',body:'original',now:new Date().toISOString()})
    return {actor,object}
  } finally { await identity.close(); store.close() }
}
export function effects(s,n) { assert.equal(s.results.length,n); assert.equal(s.events.length,n); if(n) {assert.equal(s.results[0].input_revision,1); assert.equal(s.results[0].job_id,s.id); assert.equal(s.events[0].job_id,s.id)} }
export function ended(run,n,outcome) { assert.equal(run.attempt,n); assert.equal(run.outcome,outcome); assert(Number.isSafeInteger(run.started_at)&&Number.isSafeInteger(run.ended_at)&&run.ended_at>=run.started_at) }
export function causes(e) { const out=[]; for(let p=e;p;p=p.cause)out.push(p.message); return out }
