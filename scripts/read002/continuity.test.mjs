import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {ProbeStorage} from '../../packages/knowledgeos-panel/src/host/storage.ts'
import {IdentityService} from '../../packages/knowledgeos-panel/src/host/identity.ts'
import {decodeText} from '../../packages/knowledgeos-panel/src/host/text-document.ts'
import {seed} from '../fnd006/independent/common.mjs'

test('personal reading position only accepts a current source and revision',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kos-position-'))
  const {actor}=await seed({ProbeStorage,IdentityService},dir)
  const bytes=Buffer.from('# One\n\n## Two\n\nContents'),hash=createHash('sha256').update(bytes).digest('hex')
  const s=new ProbeStorage({dataDir:dir})
  try{
    const {receipt:v}=s.assets.publish(actor,{title:'sample.md',key:randomUUID()},{key:randomUUID()+'.md',byteLength:bytes.length,sha256:hash},{media:'text/markdown',...decodeText(bytes,'text/markdown')})
    const t={asset_id:v.id,version_id:v.version_id,ordinal:1}
    const read=()=>s.citations.navigation(actor,t)
    assert.deepEqual(read(),{actor_id:actor.userId,revision:0,position:null,bookmarks:[]})
    const write=(source_hash,rev)=>s.citations.savePosition(actor,{...t,source_hash},rev,actor.userId)
    assert.throws(()=>write('0'.repeat(64),0),{status:409})
    const src=s.citations.source(actor,t),point=createHash('sha256').update(src.text).digest('hex')
    assert.equal(write(point,0).revision,1)
    assert.throws(()=>write(point,0),{status:409})
    assert.deepEqual(read().position,{ordinal:1,source_hash:point})
  }finally{s.close()}
})
