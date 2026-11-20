import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openPdf } from '../../packages/knowledgeos-panel/lib/pdf-extractor.js'
import { acceptanceSamples } from './acceptance-samples.mjs'

const script = fileURLToPath(new URL('./acceptance-samples.mjs', import.meta.url))
const hashes = {
  'a08-v1.docx': '206ac9b634ed953c67424fdd00725eafdc44bf0ab3e06eefcc4cec0b466c74ef',
  'a08-reference.pdf': '42c626e56de19748ea353c72a35b0ff63dd670eeaa9d4cda24e572fc673ee503',
  'a08-v2.docx': '9d686f6cb8a770c78d4866dc8c2f9e9bf41475e41491be2ead1eeccbcaa1c62b',
}

test('CLI produces fixed originals in a new directory and reports their hashes', t => {
  const root = mkdtempSync(join(tmpdir(), 'a08-fixture-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const run of ['first', 'second']) {
    const dir = join(root, run)
    const output = execFileSync(process.execPath, [script, dir], { encoding: 'utf8' })
    assert.deepEqual(readdirSync(dir).sort(), Object.keys(hashes).sort())
    const lines = Object.entries(hashes).map(([name, expected]) => {
      const digest = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
      assert.equal(digest, expected, name)
      return `${expected}  ${name}`
    })
    assert.deepEqual(output.trimEnd().split(/\r?\n/).sort(), lines.sort())
  }
})

// Use an independent ZIP/namespace-aware XML reader, not substring matches in the archive.
const inspectWord = String.raw`
from hashlib import sha256
from io import BytesIO
from posixpath import dirname, join
from sys import stdin, argv
from xml.etree import ElementTree as ET
from zipfile import ZipFile

rev, count = argv[1:]
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
      'ct': 'http://schemas.openxmlformats.org/package/2006/content-types'}
with ZipFile(BytesIO(stdin.buffer.read())) as z:
    assert z.testzip() is None
    def xml(name): return ET.fromstring(z.read(name))
    def text(el): return ''.join(t.text or '' for t in el.findall('.//w:t', ns))
    main, = xml('_rels/.rels').findall('rel:Relationship', ns)
    assert main.get('Type') == ns['r'] + '/officeDocument'
    path = main.attrib['Target']
    types = xml('[Content_Types].xml')
    assert any(p.get('PartName') == '/' + path and p.get('ContentType') == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' for p in types.findall('ct:Override', ns))
    body = xml(path).find('w:body', ns)
    title, table, drawing, line1, line2, section = list(body)
    assert text(title) == 'A08 sample V' + rev
    assert [[text(c) for c in row.findall('w:tc', ns)] for row in table.findall('w:tr', ns)] == [['Item', 'Count'], ['Quartz', count]]
    assert [text(line1), text(line2)] == ['if count < 20:', '    mark(count)']
    for line in [line1, line2]:
        assert line.find('w:r/w:rPr/w:rFonts', ns).get('{%s}ascii' % ns['w']) == 'Courier New'
    assert line2.find('w:r/w:t', ns).get('{http://www.w3.org/XML/1998/namespace}space') == 'preserve'
    embed = drawing.find('.//a:blip', ns).attrib['{%s}embed' % ns['r']]
    image, = xml('word/_rels/document.xml.rels').findall('rel:Relationship', ns)
    assert image.get('Id') == embed and image.get('Type') == ns['r'] + '/image'
    assert image.get('TargetMode', 'Internal') == 'Internal'
    png = z.read(join(dirname(path), image.attrib['Target']))
    # The visually verified 32x32 blue/gold quadrant image (not a placeholder).
    assert sha256(png).hexdigest() == '14d4ef8c1246bc89dbb813af5e2c897f90d5265ffe6a4450720b06eb6ca59a7b'
`

for (const [rev, count] of [['1', '17'], ['2', '29']]) {
  test(`Word V${rev} has the expected cells, embedded picture and indented code`, () => {
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
    execFileSync(python, ['-I', '-c', inspectWord, rev, count], {
      input: acceptanceSamples()[`a08-v${rev}.docx`], windowsHide: true,
    })
  })
}

test('PDF page has readable table and code and paints the quadrant image', async t => {
  const bytes = acceptanceSamples()['a08-reference.pdf']
  const pdf = await openPdf(bytes)
  t.after(() => pdf.close())
  assert.equal(pdf.numPages, 1)
  const { text } = await pdf.page(1)
  assert.deepEqual(text.split('\n').map(line => line.trim()),
    ['A08 sample V1', 'Item Count', 'Quartz 17', 'if count < 20:', 'mark(count)'])
  // PDF text extraction normalizes whitespace and cannot tell whether the picture was painted.
  const source = bytes.toString('ascii')
  assert.match(source, /72 628 240 48 re 72 652 m 312 652 l 192 628 m 192 676 l S/)
  assert.match(source, /\/Quadrants 7 0 R/)
  assert.match(source, /7 0 obj\s*<< \/Type \/XObject \/Subtype \/Image \/Width 2 \/Height 2 [^>]+>>\s*stream\s*2465aae9ad312465aa2465aa>/)
  assert.match(source, /72 0 0 72 72 540 cm \/Quadrants Do/)
  assert.match(source, /\/Code 6 0 R/)
  assert.match(source, /6 0 obj\s*<<[^>]*\/BaseFont \/Courier >>/)
  assert.ok(source.includes(String.raw`/Code 12 Tf 72 500 Td (    mark\(count\)) Tj`))
})
