import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import {seed} from '../fnd006/independent/common.mjs'
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'

const blob=(value,ext)=>({key:randomUUID()+'.'+ext,byteLength:value.length,sha256:createHash('sha256').update(value).digest('hex')})
async function setup(){
  const root=mkdtempSync(join(tmpdir(),'kos-office-store-')),{actor}=await seed(lib,root),s=new lib.ProbeStorage({dataDir:root}),db=new DatabaseSync(join(root,'knowledgeos.sqlite'))
  const add=(extra={})=>s.assets.publish(actor,{title:'word.docx',key:randomUUID(),...extra},blob('source','docx'),{media:WORD_MEDIA.docx}).receipt
  const r=add(),args=[actor,r.id,r.version_id],o=s.office
  return {s,db,o,args,r,actor,add,close:()=>{db.close();s.close()}}
}
test('completed PDF and quality note survive failed, cancelled and superseded attempts; replay is version-bound',async()=>{
  const {o,db,args,r,actor,add,close}=await setup()
  try{
    const key=randomUUID(),result=blob('first pdf','pdf'),first=o.start(...args,key),job=o.claim()
    assert.equal(o.start(...args,key).id,first.id);assert.throws(()=>o.start(...args,randomUUID()),{code:'CONVERSION_IN_PROGRESS'})
    assert.equal(o.source(job.token).versionId,r.version_id);assert.equal(o.complete(job.token,result,1,['Test font']),true)
    const noteKey=randomUUID(),note=o.note(...args,first.id,noteKey,1,'Test observation')
    assert.equal(o.note(...args,first.id,noteKey,1,'Test observation').id,note.id)
    assert.throws(()=>o.note(...args,first.id,noteKey,1,'Changed'),{code:'IDEMPOTENCY_CONFLICT'})
    assert.throws(()=>o.note(...args,first.id,randomUUID(),2,'Wrong page'),{code:'INVALID_QUALITY_NOTE'})
    const failed=o.start(...args,randomUUID()),f=o.claim();o.fail(f.token,'INVALID_DOCUMENT')
    const cancelled=o.start(...args,randomUUID()),c=o.claim();o.cancel(...args,cancelled.id)
    assert.equal(o.complete(c.token,blob('late cancel','pdf'),1,[]),false)
    const stale=o.start(...args,randomUUID()),v=o.claim(),r2=add({assetId:r.id,expectedVersion:1})
    assert.equal(o.renew(v.token),false);assert.equal(o.complete(v.token,blob('late stale','pdf'),1,[]),false)
    assert.throws(()=>o.start(...args,randomUUID()),{code:'SOURCE_CHANGED'});assert.throws(()=>o.start(actor,r.id,r2.version_id,key),{code:'IDEMPOTENCY_CONFLICT'})
    assert.deepEqual(o.list(actor,r.id,r2.version_id).conversions,[])
    const versions=o.list(...args).conversions;assert.deepEqual(versions.map(x=>[x.id,x.state]),[[stale.id,'superseded'],[cancelled.id,'cancelled'],[failed.id,'failed'],[first.id,'ready']]);assert.equal(versions.at(-1).notes[0].body,'Test observation')
    assert.deepEqual(o.result(...args,first.id,false),result);assert.equal(db.prepare("SELECT count(*) n FROM blobs WHERE media_type='application/pdf'").get().n,1)
  }finally{close()}
})
test('expired claim cannot finalize; reclaimed work loses authorization on logout; missing legacy ticket fails closed',async()=>{
  const {o,db,args,actor,close}=await setup()
  try{
    const first=o.start(...args,randomUUID());db.prepare('DELETE FROM office_authorizations WHERE conversion_id=?').run(first.id)
    assert.equal(o.claim(),undefined);assert.equal(o.list(...args).conversions[0].failure_code,'AUTHORIZATION_LOST')
    o.start(...args,randomUUID());const old=o.claim();db.prepare("UPDATE office_conversions SET lease_until='2000-01-01' WHERE lease_token=?").run(old.token)
    assert.equal(o.complete(old.token,blob('expired','pdf'),1,[]),false);const renewed=o.claim();assert.notEqual(renewed.token,old.token);assert(o.renew(renewed.token))
    db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(new Date().toISOString(),actor.sessionId)
    assert.equal(o.source(renewed.token),undefined);assert.equal(o.complete(renewed.token,blob('revoked','pdf'),1,[]),false)
    assert.equal(db.prepare('SELECT count(*) n FROM office_conversions WHERE failure_code=?').get('AUTHORIZATION_LOST').n,2);assert.throws(()=>o.list(...args),{code:'ASSET_NOT_FOUND'})
    assert.equal(db.prepare("SELECT count(*) n FROM blobs WHERE media_type='application/pdf'").get().n,0)
  }finally{close()}
})
