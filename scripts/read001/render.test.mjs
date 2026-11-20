import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { inflateSync, crc32 } from 'node:zlib'
import { fixture } from '../lib002/pdf-fixtures.mjs'

// Build the actual worker from source in disposable test output, never into lib/.
const here = dirname(fileURLToPath(import.meta.url)), pkg = join(here, '../../packages/knowledgeos-panel')
const require = createRequire(join(pkg, 'package.json'))
let dir, render, openPdf, normalizeBoxes, normalizeText
before(async () => {
  dir = await mkdtemp(join(here, 'render-tmp-'))
  const entries = ['pdf-extractor', 'reader-render', 'reader-render-page']
  await require('esbuild').build({absWorkingDir: pkg, entryPoints: entries.map(s => 'src/host/'+s+'.ts'),
    outdir: dir, platform:'node', target:'node22', format:'esm', bundle:true, splitting:true, outExtension:{'.js':'.js'}})
  await copyFile(require.resolve('@embedpdf/pdfium/pdfium.wasm'), join(dir, 'pdfium.wasm'))
  const load = name => import(pathToFileURL(join(dir, name+'.js')))
  ;({render} = await load('reader-render')); ({openPdf} = await load('pdf-extractor'))
  ;({normalizeBoxes, normalizeText} = await load('reader-render-page'))
})
after(async () => { if (dir) await rm(dir, {recursive:true,force:true}) })

function pixels(page) {
  assert.match(page.image, /^data:image\/png;base64,/)
  const png = Buffer.from(page.image.split(',')[1], 'base64')
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a')
  let rgb
  for (let i=8; i<png.length;) {
    const n=png.readUInt32BE(i), tag=png.toString('ascii',i+4,i+8), data=png.subarray(i+8,i+8+n)
    assert.equal(png.readUInt32BE(i+8+n), crc32(png.subarray(i+4,i+8+n)))
    if (tag==='IHDR') {assert.equal(data.readUInt32BE(),page.width); assert.equal(data.readUInt32BE(4),page.height)}
    if (tag==='IDAT') rgb=inflateSync(data)
    i+=12+n
  }
  assert.equal(rgb.length,(1+3*page.width)*page.height)
  return (x,y) => rgb[y*(1+3*page.width)+1+3*x]
}

function rotated() {
  // Introduce a crop offset and intrinsic rotation on the first physical page.
  const src = fixture({pages:['   A', null],unicode:true}).toString('latin1')
  const changed = src.replace('/MediaBox [0 0 612 792]', '/MediaBox [0 0 612 792] /CropBox [5 25 155 125] /Rotate 90')
  // Rebuild xref and startxref after the changed page dictionary.
  const body = changed.slice(0,changed.indexOf('xref\n'))
  const offsets = [...body.matchAll(/^(\d+) 0 obj$/gm)].map(m=>String(m.index).padStart(10,'0')+' 00000 n \n')
  return Buffer.from(body+'xref\n0 '+(offsets.length+1)+'\n0000000000 65535 f \n'+offsets.join('')+changed.slice(changed.indexOf('trailer\n')).replace(/startxref\n\d+/, 'startxref\n'+body.length),'latin1')
}

test('cropped and rotated original: Chinese UTF-16 range covers the actual glyph ink',async()=>{
  const bytes=rotated(), p=await render(bytes,1), doc=await openPdf(bytes)
  try {assert.equal((await doc.page(1)).text,p.text)} finally {await doc.close()}
  assert.equal(p.text,'\u4e2d'); assert.deepEqual([p.width,p.height],[200,300]); assert.equal(p.boxes.length,1)
  const box=p.boxes[0]; assert.deepEqual([box.start,box.end],[0,1]); const at=pixels(p)
  let ink=0,inside=0
  for(let y=0;y<p.height;y++) for(let x=0;x<p.width;x++) if(at(x,y)<128){
    ink++; if(x>=box.x-1 && y>=box.y-1 && x<=box.x+box.width+1 && y<=box.y+box.height+1) inside++
  }
  assert.ok(ink>10); assert.ok(inside/ink>0.97)
  const scan=await render(bytes,2); assert.equal(scan.text,''); assert.deepEqual(scan.boxes,[])
  const photo=pixels(scan); assert.ok(photo(60,scan.height-60)<10); assert.equal(photo(1,1),255)
})

test('raw-to-normalized UTF-16: split surrogates, CRLF, invalid surrogate and trimmed margins',()=>{
  const raw=' \r\nA\ud83d\ude80\r\n\u4e2d\rZ\ud800 ', text=normalizeText(raw), rect={x:1,y:2,width:3,height:4}
  const boxes=normalizeBoxes(raw,Array(raw.length).fill(rect),text)
  assert.equal(text,'A\ud83d\ude80\n\u4e2d\nZ\ufffd')
  assert.deepEqual(boxes.map(b=>[b.start,b.end]),[[0,1],[1,3],[4,5],[6,7],[7,8]])
  assert.deepEqual(normalizeBoxes('  \r\n',[],''),[])
})

test('parser slots are independent; only the requested page is extracted',async t=>{
  const bytes=fixture({pages:['a'.repeat(32_001),'read this']})
  const docs=await Promise.all([openPdf(bytes),openPdf(bytes)])
  t.after(()=>Promise.all(docs.map(doc=>doc.close())))
  const page=await render(bytes,2)
  assert.equal(page.text,'read this'); assert.equal(Math.max(page.width,page.height),1536)
  await assert.rejects(render(bytes,1),{code:'PDF_RENDER_FAILED'})
})

test('input, deadlines, abort and concurrency release worker slots',async t=>{
  const bytes=fixture(); for(const n of [0,1.5,NaN,3,10001]) await assert.rejects(render(bytes,n),RangeError)
  for(const input of ['C:/secret/doc.pdf',new Uint8Array(),new Uint8Array(64*1024*1024+1),Buffer.from('bad')]) await assert.rejects(render(input,1),{code:'PDF_RENDER_FAILED',message:'PDF page unavailable'})
  const a=new AbortController(); a.abort(); await assert.rejects(render(bytes,1,a.signal),{name:'AbortError'})
  const b=new AbortController(), c=new AbortController()
  const one=assert.rejects(render(bytes,1,b.signal),{name:'AbortError'}), two=assert.rejects(render(bytes,2,c.signal),{name:'AbortError'})
  await assert.rejects(render(bytes,1),{code:'PDF_BUSY'}); b.abort();c.abort();await Promise.all([one,two])
  t.mock.timers.enable({apis:['setTimeout']});const expired=assert.rejects(render(bytes,1),{code:'PDF_RENDER_FAILED'});t.mock.timers.tick(16_000)
  await expired;t.mock.timers.reset();assert.equal((await render(bytes,2)).text,'second')
})
