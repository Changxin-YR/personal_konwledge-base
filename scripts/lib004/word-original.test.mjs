import assert from 'node:assert/strict'
import {mkdtempSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {PdfOriginals} from '../../packages/knowledgeos-panel/src/host/pdf-originals.ts'
import {WORD_MEDIA} from '../../packages/knowledgeos-panel/src/host/office-schema.ts'
import {acceptanceSamples} from './acceptance-samples.mjs'
import {execFileSync} from 'node:child_process'
import {verifyWordBytes} from '../../packages/knowledgeos-panel/src/host/word-original.ts'

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

test('normal deflated OOXML is verified against the decoded member lengths and checksums',async()=>{
  const original=acceptanceSamples()['a08-v1.docx']
  const zip=execFileSync(process.env.PYTHON??'python',['-I','-c',`import io,sys,zipfile
out=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as src, zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as dst:
 for name in src.namelist(): dst.writestr(name,src.read(name))
sys.stdout.buffer.write(out.getvalue())`],{input:original})
  await verifyWordBytes(zip,WORD_MEDIA.docx)
  const damaged=Buffer.from(zip),central=damaged.readUInt32LE(damaged.length-6);damaged.writeUInt32LE(0,central+16)
  await assert.rejects(verifyWordBytes(damaged,WORD_MEDIA.docx),{message:'INVALID_WORD'})
})
