import { createHash } from 'node:crypto'

// Entire public input. Offsets are 1-based and inclusive. Preserve leading spaces and LF bytes.
export const REPOSITORY = 'fixture-lab/shipping-rules'
export const PATH = 'src/shipping-fee.js'
export const UNPINNED_PATH = 'src/unpinned.js'
export const FIRST = 2, LAST = 6
export const QUESTION = '只根据选中行，shippingFee 负责什么？请在解读中分别写出 subtotal=50 和 subtotal=51 的实际运费（请用‘50→数值，51→数值’），说明注释与实现的边界是否一致。哪些外部模块调用它？请在局限中说明依据。'
export const LINES = Object.freeze([
  '// Public synthetic shipping example.',
  '// Free shipping at subtotal >= 50.',
  'export function shippingFee(subtotal) {',
  '  if (subtotal > 50) return 0;',
  '  return 8;',
  '}',
  '// OUTSIDE_RANGE_SENTINEL_7B',
])
export const SOURCE = LINES.join('\n') + '\n'
export const UNPINNED_SOURCE = '// UNPINNED_SENTINEL_91\n'

// Git objects computed from the public input, including the unpinned file's tree entry.
export function gitOid(type, input) {
  const bytes = Buffer.from(input)
  return createHash('sha1').update(type + ' ' + bytes.length + '\0').update(bytes).digest('hex')
}
const treeEntry = (mode, name, oid) => Buffer.concat([Buffer.from(mode + ' ' + name + '\0'), Buffer.from(oid, 'hex')])
export const BLOB = gitOid('blob', SOURCE)
export const UNPINNED_BLOB = gitOid('blob', UNPINNED_SOURCE)
const srcTree = gitOid('tree', Buffer.concat([treeEntry('100644', 'shipping-fee.js', BLOB), treeEntry('100644', 'unpinned.js', UNPINNED_BLOB)]))
export const TREE = gitOid('tree', treeEntry('40000', 'src', srcTree))
const author = 'Fixture <fixture@example.invalid> 1700000000 +0000'
export const COMMIT = gitOid('commit', ['tree ' + TREE, 'author ' + author, 'committer ' + author, '', 'EXPLAIN-001 shipping fixture', ''].join('\n'))
export const LOCATION = Object.freeze({ path: PATH, commit: COMMIT, blob_sha: BLOB, start_line: FIRST, end_line: LAST })
export function quote(first, last) {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < FIRST || last > LAST || first > last) throw RangeError('outside selected lines')
  return LINES.slice(first - 1, last).join('\n')
}
export function seedSnapshot(store, actor) {
  const entries = [
    { path: 'src', kind: 'directory', sha: srcTree, size: null },
    { path: PATH, kind: 'file', sha: BLOB, size: Buffer.byteLength(SOURCE) },
    { path: UNPINNED_PATH, kind: 'file', sha: UNPINNED_BLOB, size: Buffer.byteLength(UNPINNED_SOURCE) },
  ]
  const [owner, name] = REPOSITORY.split('/')
  return store.repositories.saveSnapshot(actor, actor.userId, { owner, name, private: false, id: 20001 },
    { kind: 'commit', value: COMMIT }, '', { commit: COMMIT, tree: TREE }, entries,
    new AbortController().signal, { entry: entries[1], bytes: Buffer.from(SOURCE) }).snapshot
}
