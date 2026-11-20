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
import {seed} from '../fnd006/independent/common.mjs'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'

test('migrating a populated v9 database to v10 preserves original receipts, anchors, identity and ledger; injected failure rolls back',async()=>{
  const root=mkdtempSync(join(tmpdir(),'kos-office-migration-')), prior=join(root,'v9.mjs')
  writeFileSync(prior,execFileSync('git',['show','0e9f37e9966950c6c5645abafff772654c547bd7:packages/knowledgeos-panel/lib/test-support.js']))
  const lib=await import(pathToFileURL(prior)),{actor}=await seed(lib,root),old=new lib.ProbeStorage({dataDir:root})
  const bytes=Buffer.from('# 笔记\n\n旧版本\n'), spec={key:randomUUID(),title:'previous.md'},blob={key:randomUUID()+'.txt',sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length},text={media:'text/markdown',...decodeText(bytes,'text/markdown')}
  const {receipt}=old.assets.publish(actor,spec,blob,text);old.close()
  const db=new DatabaseSync(join(root,'knowledgeos.sqlite'),{readOnly:true})
  const tables=['schema_migrations','users','auth_sessions','assets','asset_versions','blobs','text_versions','text_blocks']
  const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]))
  try{
    const before=snapshot(),broken=new ProbeStorage({dataDir:root,failureAt:'v10:after-schema'})
    assert.equal(broken.available,false);broken.close();assert.deepEqual(snapshot(),before)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,9)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'office_%'").get().n,0)
    for(let i=0;i<2;i++){
      const upgraded=new ProbeStorage({dataDir:root});try{
        assert(upgraded.available,upgraded.failure?.message);const after=snapshot();assert.equal(after.schema_migrations.pop().version,10);assert.deepEqual(after,before)
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.deepEqual(upgraded.assets.publish(actor,spec,blob,text),{receipt,replayed:true})
        assert.deepEqual(upgraded.assets.blocks(actor,receipt.id,receipt.version_id,1,10).blocks.map(b=>b.anchor),text.blocks.map(b=>b.anchor))
      }finally{upgraded.close()}
    }
  }finally{db.close()}
})
