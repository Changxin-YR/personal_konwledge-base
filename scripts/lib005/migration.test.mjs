import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {ProbeStorage} from '../../packages/knowledgeos-panel/lib/storage.js'
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'
import {seed} from '../fnd006/independent/common.mjs'

test('v13 migration rolls back cleanly and preserves v12 sources, conversion history, notes and authorization',async()=>{
  const root=mkdtempSync(join(tmpdir(),'kos-zip-migration-')),prior=join(root,'v12.mjs')
  writeFileSync(prior,execFileSync('git',['show','f4d3421f507654c6c82f6994f5dbd4012263685e:packages/knowledgeos-panel/lib/test-support.js']))
  const lib=await import(pathToFileURL(prior)),{actor}=await seed(lib,root),old=new lib.ProbeStorage({dataDir:root})
  const blob=ext=>({key:randomUUID()+'.'+ext,byteLength:ext.length,sha256:createHash('sha256').update(ext).digest('hex')})
  const source=blob('docx'),pdf=blob('pdf'),r=old.assets.publish(actor,{title:'sample.docx',key:randomUUID()},source,{media:WORD_MEDIA.docx}).receipt
  const args=[actor,r.id,r.version_id],job=old.office.start(...args,randomUUID()),lease=old.office.claim()
  assert(old.office.complete(lease.token,pdf,1,[]));old.office.note(...args,job.id,randomUUID(),1,'page one')
  const history=old.office.list(...args);old.close()
  const db=new DatabaseSync(join(root,'knowledgeos.sqlite'),{readOnly:true})
  try{
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name)
    const snapshot=()=>Object.fromEntries(names.map(n=>[n,db.prepare(`SELECT * FROM "${n}"`).all()]))
    const before=snapshot(),broken=new ProbeStorage({dataDir:root,failureAt:'v13:after-schema'})
    assert.equal(broken.available,false);broken.close();assert.deepEqual(snapshot(),before)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,12)
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name GLOB 'zip_*'").get().n,0)
    for(let i=0;i<2;i++){
      const next=new ProbeStorage({dataDir:root});try{
        assert(next.available,next.failure?.message);const after=snapshot();assert.deepEqual(after.schema_migrations.splice(before.schema_migrations.length).map(m=>m.version),[13,14]);assert.deepEqual(after,before)
        assert.deepEqual(next.office.list(...args),history);assert.deepEqual(next.office.result(...args,job.id,false),pdf)
        assert.deepEqual(next.assets.original(...args,true),{...source,media:WORD_MEDIA.docx})
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
      }finally{next.close()}
    }
  }finally{db.close()}
})
