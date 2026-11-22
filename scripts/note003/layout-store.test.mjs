import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import * as lib from '../../packages/knowledgeos-panel/lib/test-support.js'
import {MIGRATION_V27_CHECKSUM,MIGRATION_V28_CHECKSUM,MIGRATION_V29_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {seed} from '../fnd006/independent/common.mjs'

test('v27 migration rolls back cleanly and layout revision is independent of tree, drafts and undo',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-note-map-')),oldPath=join(dir,'v26.mjs')
  writeFileSync(oldPath,execFileSync('git',['show','ac7fe69bd3bb55ea4c09e86e5c97858a239046e1:packages/knowledgeos-panel/lib/test-support.js']))
  const previous=await import(pathToFileURL(oldPath).href),{actor}=await seed(previous,dir),user=actor.userId
  const old=new previous.ProbeStorage({dataDir:dir})
  const id=old.notes.create(actor,user,randomUUID(),{kind:'plain',title:'Migrated note',body:'Root'}).data.id
  old.notes.changeOutline(actor,user,id,1,{action:'add',parent_id:id,body:'Child A'})
  const made=old.notes.changeOutline(actor,user,id,2,{action:'add',parent_id:id,body:'Child B'})
  const a=made.outline.nodes.find(n=>n.body==='Child A').id,b=made.outline.nodes.find(n=>n.body==='Child B').id
  const before=old.notes.changeOutline(actor,user,id,3,{action:'move',node_id:b,parent_id:a,index:0})
  assert.equal(before.outline.can_undo,true);old.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true})
  const rows=t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),version=()=>db.prepare('PRAGMA user_version').get().user_version
  const content=()=>['notes','note_nodes','note_outline_undo','note_references'].map(rows)
  const initial=content(),ledger=rows('schema_migrations'),schema=rows('sqlite_schema')
  let s
  try{
    assert.equal(version(),26);s=new lib.ProbeStorage({dataDir:dir,failureAt:'v27:after-schema'});assert(!s.available)
    assert.match(s.failure.cause.message,/v27:after-schema/);s.close()
    assert.equal(version(),26);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(rows('sqlite_schema'),schema);assert.deepEqual(content(),initial)
    s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);assert.equal(version(),29)
    const newLedger=rows('schema_migrations');assert.equal(newLedger.pop().checksum,MIGRATION_V29_CHECKSUM);assert.equal(newLedger.pop().checksum,MIGRATION_V28_CHECKSUM);assert.equal(newLedger.pop().checksum,MIGRATION_V27_CHECKSUM);assert.deepEqual(newLedger,ledger)
    assert.deepEqual(s.notes.get(actor,id),{...before,layout:{direction:'horizontal',revision:0}})
    const change=(rev,direction)=>s.notes.saveLayout(actor,user,id,rev,direction)
    assert.deepEqual(change(0,'horizontal'),{direction:'horizontal',revision:0});assert.deepEqual(rows('note_map_layouts'),[])
    assert.deepEqual(change(0,'vertical'),{direction:'vertical',revision:1})
    assert.throws(()=>change(0,'horizontal'),{code:'LAYOUT_CONFLICT'})
    assert.throws(()=>s.notes.saveLayout(actor,randomUUID(),id,1,'horizontal'),{code:'ACTOR_CHANGED'})
    assert.deepEqual(change(1,'vertical'),{direction:'vertical',revision:1});assert.deepEqual(content(),initial)
    const undone=s.notes.changeOutline(actor,user,id,before.revision,{action:'undo'})
    assert.equal(undone.revision,before.revision+1);assert.deepEqual(undone.layout,{direction:'vertical',revision:1})
    assert.deepEqual(undone.outline.nodes.find(n=>n.id===b).parent_id,id)
    s.close();s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message)
    assert.deepEqual(s.notes.get(actor,id),undone);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{s?.close();db.close()}
})
