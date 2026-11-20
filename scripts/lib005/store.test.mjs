import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import {seed} from '../fnd006/independent/common.mjs'

const blob=(ext,data)=>({key:randomUUID()+'.'+ext,byteLength:Buffer.byteLength(data),sha256:createHash('sha256').update(data).digest('hex')})
test('preview creates no assets; only selected entries publish atomically and recover after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-zip-store-')),{actor}=await seed(lib,dir),db=new DatabaseSync(join(dir,'knowledgeos.sqlite'))
  let s=new lib.ProbeStorage({dataDir:dir})
  const members=['a','b','c'].map((x,i)=>({ordinal:i,name:x+'.pdf',path:x+'.pdf',size:20,compressedSize:10,media:'application/pdf',reason:null}))
  const spec={title:'fixture.zip',key:randomUUID()},source=blob('zip','synthetic'),key=randomUUID()
  const count=t=>db.prepare('SELECT count(*) AS n FROM '+t).get().n
  try{
    const {id}=s.archives.stage(actor,spec,source,members);assert.deepEqual(s.archives.stage(actor,spec,source,members),{id,replayed:true});assert.deepEqual(s.archives.source(actor,id),source)
    assert.throws(()=>s.archives.stage(actor,{...spec,title:'different.zip'},source,members),{code:'IDEMPOTENCY_CONFLICT'})
    assert.deepEqual([count('assets'),count('asset_versions'),count('jobs')],[0,0,0])
    const ids=s.archives.manifest(actor,id).entries.map(e=>e.id),pick=ids.slice(0,2),items=s.archives.select(actor,id,key,pick)
    assert.throws(()=>s.archives.select(actor,id,key,[ids[2]]),{code:'IDEMPOTENCY_CONFLICT'})
    assert.throws(()=>s.archives.select(actor,id,randomUUID(),[ids[2],randomUUID()]),{code:'INVALID_SELECTION'})
    const write=(m,b,hook=s.archives.publication(id,m.id,m.key))=>s.assets.publish(actor,{key:m.key,title:m.path},b,undefined,hook)
    const b=blob('pdf','first'),first=write(items[0],b);s.close();s=new lib.ProbeStorage({dataDir:dir})
    const recovered=s.archives.select(actor,id,key,pick.toReversed());assert.deepEqual(recovered.map(m=>m.imported),[true,false]);assert.equal(recovered[0].key,items[0].key)
    assert.deepEqual(write(recovered[0],b),{receipt:first.receipt,replayed:true})
    const second=blob('pdf','second');assert.throws(()=>write(recovered[1],second,s.archives.publication(id,ids[2],recovered[1].key)),{code:'SELECTION_CHANGED'})
    assert.equal(count('asset_versions'),1);s.archives.failure(actor,id,ids[1],'INVALID_PDF');assert.equal(s.archives.manifest(actor,id).entries[1].error,'INVALID_PDF')
    write(s.archives.select(actor,id,key,pick)[1],second);const manifest=s.archives.manifest(actor,id)
    assert.deepEqual(manifest.entries.map(e=>e.state),['imported','imported','available']);assert.equal(manifest.entries[0].receipt.sha256,b.sha256);assert.equal(manifest.entries[1].receipt.sha256,second.sha256)
    assert.deepEqual([count('assets'),count('asset_versions'),count('jobs'),count('zip_selections')],[2,2,0,1])
    db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(new Date().toISOString(),actor.sessionId)
    for(const denied of [()=>s.archives.list(actor),()=>s.archives.source(actor,id),()=>s.archives.manifest(actor,id),()=>s.archives.select(actor,id,key,pick)])assert.throws(denied,{code:'AUTH_REQUIRED'})
  }finally{s.close();db.close()}
})
