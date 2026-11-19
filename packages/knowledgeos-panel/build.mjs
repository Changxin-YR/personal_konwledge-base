/**
 * Build adapter for the KnowledgeOS FND-001 bundle.
 *
 * The Client half must be a DSH closure-factory artifact, not a plain Vite
 * page: the emitted `lib/client.js` registers one factory with
 * `window.__ModuleLoader__` and resolves the shell's shared modules only
 * through the `require` handed to that factory. The Host half is a normal ESM
 * package entry.
 *
 * Run `npm install` in this package directory once, then `node build.mjs`.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const libDir = join(root, 'lib')
const clientBody = join(libDir, 'client.body.cjs')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = manifest.name

await rm(libDir, { recursive: true, force: true })
await mkdir(libDir, { recursive: true })

// Fixed offline assets; no parser package resolution at runtime.
const wasm = fileURLToPath(import.meta.resolve('@embedpdf/pdfium/pdfium.wasm'))
await copyFile(wasm, join(libDir, 'pdfium.wasm'))
for (const notice of ['LICENSE', 'LICENSE.pdfium']) {
  await copyFile(join(dirname(wasm), '..', notice), join(libDir, 'pdfium-' + notice))
}
await build({
  absWorkingDir: root, entryPoints: ['src/host/pdf-extractor.ts'], outfile: 'lib/pdf-extractor.js',
  bundle: true, format: 'esm', platform: 'node', target: 'node22',
})

await build({
  absWorkingDir: root,
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['node:*', '@deepseek-ai/schemastery'],
  sourcemap: false,
  logLevel: 'warning',
})

// Test-only entries: the real adapter and its controlled-failure helpers.
for (const [entry, outfile] of [['src/host/storage.ts', 'lib/storage.js'], ['src/host/test-support.ts', 'lib/test-support.js']]) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: ['node:*', '@deepseek-ai/schemastery'],
    sourcemap: false,
    logLevel: 'warning',
  })
}

await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  outfile: clientBody,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // Only the shell's frozen module table may stay external. Everything else
  // (including this bundle's own helpers) is inlined into the factory body.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  sourcemap: false,
  logLevel: 'warning',
})

const body = await readFile(clientBody, 'utf8')
if (/^\s*import\s/m.test(body)) throw new Error('client body unexpectedly retained an ESM import')
if (/\brequire\(\s*["'](?:node:|@deepseek-ai\/dsh-(?!.*client-ui))/m.test(body)) {
  throw new Error('client body requests a module outside the shared table')
}

const indented = body.split('\n').map(line => (line.length === 0 ? '' : `\t\t${line}`)).join('\n')
const envelope = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(id)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${indented}
\t\treturn module.exports;
\t}
});
`
await writeFile(join(libDir, 'client.js'), envelope, 'utf8')
await rm(clientBody, { force: true })

for (const file of ['lib/index.js', 'lib/storage.js', 'lib/test-support.js', 'lib/client.js']) {
  const bytes = await readFile(join(root, file))
  const digest = createHash('sha256').update(bytes).digest('hex')
  console.log(`${file}  ${bytes.length} bytes  sha256=${digest}`)
}
