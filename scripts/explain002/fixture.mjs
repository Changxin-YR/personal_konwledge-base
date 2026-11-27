import { createHash } from 'node:crypto'

export const REPOSITORY = 'fixture-lab/module-boundary'
export const ENTRY_PATH = 'src/order-entry.js'
export const SERVICE_PATH = 'src/order-service.js'
export const STORE_PATH = 'src/order-store.js'
export const UNPINNED_PATH = 'README.md'
export const FILES = Object.freeze([
  { path: ENTRY_PATH, lines: Object.freeze([
    'export async function submit(order, actor) {',
    '  assertActor(actor);',
    '  const draft = normalize(order);',
    '  return service.save(draft);',
    '}',
  ]) },
  { path: SERVICE_PATH, lines: Object.freeze([
    'export function save(order) {',
    "  if (!order.id) throw new Error('INVALID_ORDER');",
    '  return store.insert(order);',
    '}',
  ]) },
  { path: STORE_PATH, lines: Object.freeze([
    'export function insert(order) {',
    "  return database.run('insert', order);",
    '}',
  ]) },
  { path: UNPINNED_PATH, lines: Object.freeze(['# module fixture\n']) },
])
export const ENTRY = FILES[0]
export const SERVICE = FILES[1]
export const STORE = FILES[2]
export const QUESTION = '请说明入口、服务和存储文件之间的实际调用与数据路径，分别说明正常提交、订单校验失败和缺少外部调用者时的边界，并指出当前代码能支持的设计取舍。'

export function gitOid(type, input) {
  const bytes = Buffer.from(input)
  return createHash('sha1').update(type + ' ' + bytes.length + '\0').update(bytes).digest('hex')
}
const treeEntry = (mode, name, oid) => Buffer.concat([Buffer.from(mode + ' ' + name + '\0'), Buffer.from(oid, 'hex')])
for (const file of FILES) file.source = file.lines.join('\n') + '\n'
for (const file of FILES) file.blob = gitOid('blob', file.source)
export const SRC_TREE = gitOid('tree', Buffer.concat(FILES.slice(0, 3).map(file => treeEntry('100644', file.path.slice(4), file.blob))))
export const TREE = gitOid('tree', Buffer.concat([treeEntry('100644', 'README.md', FILES[3].blob), treeEntry('40000', 'src', SRC_TREE)]))
const author = 'Fixture <fixture@example.invalid> 1700000000 +0000'
export const COMMIT = gitOid('commit', ['tree ' + TREE, 'author ' + author, 'committer ' + author, '', 'EXPLAIN-002 module fixture', ''].join('\n'))
export const TREE_FACTS = Object.freeze([
  { path: 'src', kind: 'directory', size: null },
  ...FILES.slice(0, 3).map(file => ({ path: file.path, kind: 'file', size: Buffer.byteLength(file.source) })),
  { path: UNPINNED_PATH, kind: 'file', size: Buffer.byteLength(FILES[3].source) },
])
export const SOURCES = Object.freeze(FILES.slice(0, 3).map(file => Object.freeze({ path: file.path, first: 1, last: file.lines.length, blob: file.blob })))
export const UNPINNED_BLOB = FILES[3].blob

export function source(path) {
  const file = FILES.find(item => item.path === path)
  if (!file) throw new Error('unknown fixture path')
  return file.source
}
export function quote(path, first, last) {
  const file = FILES.find(item => item.path === path)
  if (!file || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > file.lines.length || first > last) throw RangeError('outside fixture range')
  return file.lines.slice(first - 1, last).join('\n')
}
export function modulePacket() {
  return {
    commit: COMMIT,
    tree: TREE_FACTS,
    sources: SOURCES.map(item => ({ path: item.path, commit: COMMIT, blob_sha: item.blob, start_line: item.first, end_line: item.last,
      total_lines: FILES.find(file => file.path === item.path).lines.length, lines: FILES.find(file => file.path === item.path).lines.map((text, index) => ({ line: index + 1, text })) })),
    question: QUESTION,
  }
}
export function moduleReply(packet) {
  const fact = (path, start_line, end_line) => ({ path, start_line, end_line, quote: packet.sources.find(source => source.path === path).lines.slice(start_line - 1, end_line).map(row => row.text).join('\n') })
  const facts = [
    fact(ENTRY_PATH, 1, 4),
    fact(SERVICE_PATH, 1, 3),
    fact(STORE_PATH, 1, 2),
  ]
  return {
    facts,
    summary: [{ text: '入口负责身份检查和规范化，再把订单交给服务，服务把有效订单交给存储边界。', facts: [1, 2, 3] }],
    relations: [{ text: 'submit 调用 service.save，save 调用 store.insert，insert 调用 database.run。', facts: [1, 2, 3] }],
    flows: [
      { name: '正常提交', steps: [
        { text: '入口先检查 actor，再规范化订单。', facts: [1] },
        { text: '服务检查订单 id 后调用存储。', facts: [2] },
        { text: '存储边界把订单交给数据库适配器。', facts: [3] },
      ] },
      { name: '订单校验失败', steps: [{ text: '缺少订单 id 时服务直接抛出 INVALID_ORDER。', facts: [2] }] },
    ],
    tradeoffs: [{ text: '入口、业务校验和持久化被拆到不同文件，便于分别约束边界，但当前片段没有展示事务和重试策略。', facts: [1, 2, 3] }],
    limits: ['当前固定提交没有提供 assertActor、normalize、database 适配器或外部调用者的实现，不能确认它们的权限、事务和重试行为。'],
  }
}

export function seedSnapshot(store, actor) {
  const entries = TREE_FACTS.map(entry => {
    const file = FILES.find(item => item.path === entry.path)
    const sha = file ? file.blob : entry.path === 'src' ? SRC_TREE : undefined
    return sha ? { ...entry, sha } : { ...entry }
  })
  const [owner, name] = REPOSITORY.split('/')
  return store.repositories.saveSnapshot(actor, actor.userId, { owner, name, private: false, id: 20002 },
    { kind: 'commit', value: COMMIT }, '', { commit: COMMIT, tree: TREE }, entries,
    new AbortController().signal).snapshot
}
