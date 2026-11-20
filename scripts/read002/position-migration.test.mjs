import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

test('v16 rollback is atomic and upgrade preserves published v15 asset, citation and locator',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-v16-')),prior=join(dir,'v15.mjs')
  writeFileSync(prior,execFileSync('git',['show','fdac3b02fc5ac42eabef72374aee9b7050c942e3:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(prior).href),{actor}=await seed(old,dir),s=new old.ProbeStorage({dataDir:dir})
  const bytes=Buffer.from('actual source with quote'),hash=createHash('sha256').update(bytes).digest('hex')
  const {receipt:r}=s.assets.publish(actor,{title:'v15.txt',key:randomUUID()},{key:randomUUID()+'.txt',byteLength:bytes.length,sha256:hash},{media:'text/plain',...decodeText(bytes,'text/plain')})
  const {data:c}=s.citations.create(actor,{asset_id:r.id,version_id:r.version_id,ordinal:1,start:19,end:24,source_hash:hash},randomUUID())
  const before=s.citations.resolve(actor,c.id);assert.equal(before.quote,'quote');assert(before.locator);s.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'))
  const version=()=>db.prepare('PRAGMA user_version').get().user_version
  const schema=()=>db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()
  const data=table=>db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  const tracked=schema().filter(x=>x.type==='table'&&x.name!=='schema_migrations').map(x=>x.name)
  const original=tracked.map(data),definitions=schema(),ledger=data('schema_migrations')
  let next
  try{
    assert.equal(version(),15)
    next=new ProbeStorage({dataDir:dir,failureAt:'v16:after-schema'});assert.equal(next.available,false);assert.match(next.failure.cause.message,/v16:after-schema/);next.close()
    assert.equal(version(),15);assert.deepEqual(schema(),definitions);assert.deepEqual(tracked.map(data),original);assert.deepEqual(data('schema_migrations'),ledger)
    for(let boot=0;boot<2;boot++){
      next=new ProbeStorage({dataDir:dir});assert(next.available,next.failure?.message);assert.equal(version(),16)
      assert.deepEqual(tracked.map(data),original)
      assert.deepEqual(data('schema_migrations').slice(0,15),ledger);assert.deepEqual(data('schema_migrations').slice(15).map(row=>row.version),[16])
      assert.deepEqual(next.citations.resolve(actor,c.id),before);assert.deepEqual(data('reading_positions'),[]);assert.deepEqual(data('reading_bookmarks'),[])
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);next.close()
    }
  }finally{next?.close();db.close()}
})
