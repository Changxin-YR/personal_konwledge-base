import assert from 'node:assert/strict'
import {mkdtempSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {PdfOriginals} from '../../packages/knowledgeos-panel/src/host/pdf-originals.ts'
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'
import {acceptanceSamples} from './acceptance-samples.mjs'

test('DOCX originals retain exact bounded input across restart; invalid Office inputs never leave stages',async()=>{
  const root=mkdtempSync(join(tmpdir(),'kos-word-')),store=new PdfOriginals(root)
  const samples=acceptanceSamples(),bytes=samples['a08-v1.docx'],wrong=samples['a08-reference.pdf']
  for(const [b,m] of [[wrong,WORD_MEDIA.docx],[wrong,WORD_MEDIA.doc],[bytes,WORD_MEDIA.doc],[bytes.subarray(0,-1),WORD_MEDIA.docx]]){
    await assert.rejects(store.putWord(b,m),{message:'INVALID_WORD'})
  }
  assert.deepEqual(readdirSync(root),[])
  const expected=Buffer.from(bytes),pending=store.putWord(bytes,WORD_MEDIA.docx);bytes.fill(0)
  const ref=await pending;store.retain(ref.key);assert.match(ref.key,/\.docx$/)
  assert.deepEqual(await new PdfOriginals(root).read(ref.key,ref.sha256,ref.byteLength),expected)
})
