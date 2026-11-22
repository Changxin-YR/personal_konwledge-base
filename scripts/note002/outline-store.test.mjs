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
import {MIGRATION_V26_CHECKSUM,MIGRATION_V27_CHECKSUM,MIGRATION_V28_CHECKSUM,MIGRATION_V29_CHECKSUM} from '../../packages/knowledgeos-panel/lib/storage.js'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {digest,seed} from '../fnd006/independent/common.mjs'

const fixture=()=>mkdtempSync(join(tmpdir(),'kos-outline-test-'))
const uuid=randomUUID,draft={title:'Persisted note',body:'Root body',kind:'reading'}
function source(storage,owner){
  const text='Fixed source for persisted note',media='text/plain',bytes=Buffer.from(text),hash=digest(bytes)
  const doc=storage.assets.publish(owner,{key:uuid(),title:'source.txt'},{key:uuid()+'.txt',sha256:hash,byteLength:bytes.length},{media,...decodeText(bytes,media)}).receipt
  const citation=storage.citations.create(owner,{asset_id:doc.id,version_id:doc.version_id,ordinal:1,start:0,end:text.length,source_hash:hash},uuid()).data
  return {text,citation}
}
const snapshot=db=>Object.fromEntries(['notes','note_nodes','note_outline_undo','note_references'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]))
function plan(storage,owner,id){
  const change=(expected,op)=>storage.notes.changeOutline(owner,owner.userId,id,expected,op)
  const get=()=>storage.notes.get(owner,id)
  return {change,get,preview:(expected,node)=>storage.notes.previewDelete(owner,owner.userId,id,expected,node),
    add(parent_id,body){return change(get().revision,{action:'add',parent_id,body}).outline.nodes.find(n=>n.body===body).id}}
}

test('v25 to v26 fault leaves all v25 definitions, history and bytes intact; retry preserves root and citation',async()=>{
  const dir=fixture(),module=join(dir,'v25.mjs')
  writeFileSync(module,execFileSync('git',['show','a72d0efb1eee62b8982eab80b803c295ad2499b1:packages/knowledgeos-panel/lib/test-support.js']))
  const old=await import(pathToFileURL(module).href),{actor:owner}=await seed(old,dir)
  const legacy=new old.ProbeStorage({dataDir:dir}),{citation,text}=source(legacy,owner)
  const note=legacy.notes.create(owner,owner.userId,uuid(),draft,citation.id).data;legacy.close()
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'),{readOnly:true}),rows=t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()
  const version=()=>db.prepare('PRAGMA user_version').get().user_version,ledger=rows('schema_migrations'),schema=rows('sqlite_schema')
  const persisted=Object.fromEntries(['notes','note_nodes','note_references','citations','asset_versions'].map(t=>[t,rows(t)]))
  let s
  try{
    assert.equal(version(),25)
    s=new lib.ProbeStorage({dataDir:dir,failureAt:'v26:after-schema'});assert.equal(s.available,false);assert.match(s.failure.cause.message,/v26:after-schema/);s.close()
    assert.equal(version(),25);assert.deepEqual(rows('schema_migrations'),ledger);assert.deepEqual(rows('sqlite_schema'),schema)
    for(const [table,value] of Object.entries(persisted))assert.deepEqual(rows(table),value)
    s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message);assert.equal(version(),29)
    const {outline,layout,...detail}=s.notes.get(owner,note.id);assert.deepEqual(layout,{direction:'horizontal',revision:0})
    assert.deepEqual(detail,note);assert.deepEqual(outline,{nodes:[Object.assign(Object.create(null),{id:note.id,parent_id:null,order_key:0,body:draft.body,body_revision:1})],can_undo:false})
    const applied=rows('schema_migrations');assert.equal(applied.pop().checksum,MIGRATION_V29_CHECKSUM);assert.equal(applied.pop().checksum,MIGRATION_V28_CHECKSUM);assert.equal(applied.pop().checksum,MIGRATION_V27_CHECKSUM);assert.equal(applied.pop().checksum,MIGRATION_V26_CHECKSUM);assert.deepEqual(applied,ledger)
    for(const [table,value] of Object.entries(persisted))assert.deepEqual(rows(table),table==='note_nodes'?value.map(r=>Object.assign(r,{archived_at:null})):value)
    assert.equal(s.citations.resolve(owner,citation.id).quote,text);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  }finally{s?.close();db.close()}
})

test('failed revision update rolls back placements and undo journal; restart retains successful undo',async()=>{
  const dir=fixture(),{actor:owner}=await seed(lib,dir)
  let s=new lib.ProbeStorage({dataDir:dir})
  const id=s.notes.create(owner,owner.userId,uuid(),draft).data.id
  const db=new DatabaseSync(join(dir,'knowledgeos.sqlite'));let {add,get,change,preview}=plan(s,owner,id)
  try{
    const a=add(id,'a'),b=add(id,'b'),a1=add(a,'a1'),before=snapshot(db),rev=get().revision
    const impact=preview(rev,a);assert.deepEqual(impact.descendant_ids,[a1]);assert.deepEqual(snapshot(db),before)
    db.exec("CREATE TRIGGER inject_outline_failure BEFORE UPDATE OF revision ON notes BEGIN SELECT RAISE(ABORT,'test rollback'); END")
    try{assert.throws(()=>change(rev,{action:'delete',node_id:a,mode:'promote',preview_token:impact.preview_token}));assert.deepEqual(snapshot(db),before)}
    finally{db.exec('DROP TRIGGER inject_outline_failure')}
    assert.throws(()=>change(rev,{action:'delete',node_id:b,mode:'subtree',preview_token:impact.preview_token}),{code:'OUTLINE_PREVIEW_REQUIRED'})
    assert.deepEqual(snapshot(db),before)
    const deleted=change(rev,{action:'delete',node_id:a,mode:'promote',preview_token:impact.preview_token})
    assert.equal(deleted.outline.can_undo,true);assert.equal(deleted.outline.nodes.find(n=>n.id===a1).parent_id,id)
    s.close();s=new lib.ProbeStorage({dataDir:dir});assert(s.available,s.failure?.message)
    ;({get,change}=plan(s,owner,id));assert.deepEqual(get(),deleted)
    const restored=change(rev+1,{action:'undo'});assert.equal(restored.outline.can_undo,false)
    assert.deepEqual(snapshot(db).note_nodes,before.note_nodes);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
    const move=change(rev+2,{action:'move',node_id:b,parent_id:a,index:0});assert.equal(move.outline.can_undo,true)
    s.notes.save(owner,owner.userId,id,rev+3,{body:'The root editor is a competing writer'})
    assert.throws(()=>change(rev+3,{action:'undo'}),{code:'REVISION_CONFLICT'})
    assert.throws(()=>change(rev+4,{action:'undo'}),{code:'OUTLINE_UNDO_UNAVAILABLE'})
    assert.equal(get().body,'The root editor is a competing writer');assert.equal(get().outline.nodes.find(n=>n.id===b).parent_id,a)
  }finally{s.close();db.close()}
})
