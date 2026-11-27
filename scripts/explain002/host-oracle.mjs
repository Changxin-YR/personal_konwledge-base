import assert from 'node:assert/strict'
import { COMMIT, FILES, SOURCES, TREE, TREE_FACTS, UNPINNED_BLOB, UNPINNED_PATH, quote, source } from './fixture.mjs'

const sourceByPath = path => SOURCES.find(item => item.path === path)
export const factLocation = ({ path, start_line, end_line }) => {
  const selected = sourceByPath(path)
  assert(selected, 'fact path must be selected')
  return { path, commit: COMMIT, blob_sha: selected.blob, start_line, end_line }
}
export function verifyLocation(actual, snapshot, expected) {
  assert.equal(actual.snapshot_id, snapshot, 'snapshot binding')
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, 'location: ' + key)
}
export function verifyCitation(actual, snapshot, location) {
  verifyLocation(actual, snapshot, location)
  assert.equal(actual.quote, quote(location.path, location.start_line, location.end_line), 'citation bytes')
}
export function verifyUrl(url, origin, pathname, expected) {
  const target = new URL(url)
  assert.equal(target.origin, origin)
  assert.equal(target.pathname, pathname)
  assert(!target.username && !target.password && !target.hash)
  assert.equal(target.searchParams.size, Object.keys(expected).length)
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(target.searchParams.getAll(key), [String(value)], 'URL: ' + key)
}
export function verifyDenial(status, payload, expected, code) {
  assert.equal(status, expected, 'denial HTTP status for ' + code + ' actual=' + status + ' expected=' + expected)
  assert.equal(payload.code, code, 'business denial code')
  assert.equal(payload.data, undefined, 'denial returned business data')
  const raw = JSON.stringify(payload)
  for (const key of ['explanation','citation','source','facts','summary','relations','flows','tradeoffs','limits','path','commit','blob_sha','start_line','end_line','snapshot_id']) {
    assert(!raw.includes('"' + key + '"'), 'denial returned ' + key)
  }
  for (const marker of [COMMIT, TREE, ...SOURCES.map(item => item.blob), ...FILES.slice(0, 3).flatMap(item => item.lines).filter(marker => marker.length >= 8 && /[A-Za-z0-9\u4e00-\u9fff]/.test(marker)), UNPINNED_PATH, UNPINNED_BLOB]) {
    assert(!raw.includes(marker), 'denial disclosed fixture bytes or location: ' + marker)
  }
}

function validReferences(value, facts, label) {
  assert(Array.isArray(value), label + ' must be an array')
  for (const claim of value) {
    assert(claim && typeof claim === 'object' && typeof claim.text === 'string' && claim.text.trim(), label + ' text')
    assert(Array.isArray(claim.facts) && claim.facts.length > 0, label + ' facts')
    assert.equal(new Set(claim.facts).size, claim.facts.length, label + ' duplicate references')
    for (const index of claim.facts) assert(Number.isSafeInteger(index) && index >= 1 && index <= facts.length, label + ' invalid fact reference')
  }
}
function clean(text) { return text.normalize('NFKC').replace(/[*_`]/g, '').replace(/\s+/g, ' ') }
function allClaimText(answer) {
  return [
    ...answer.summary.map(item => item.text),
    ...answer.relations.map(item => item.text),
    ...answer.flows.flatMap(flow => [flow.name, ...flow.steps.map(step => step.text)]),
    ...answer.tradeoffs.map(item => item.text),
  ].map(clean).join('。')
}
function verifyCallerBoundary(readings, limits) {
  const caller = /调用|调用者|调用方|使用方|外部|caller|call site|invoked|import/i
  const unknown = /无法|不能|缺少|未知|未(?:知|提供|展示|给出)|没有|未见|不(?:能|明|清楚|确定)|需要查看|cannot|unknown|not (?:shown|provided|identified)|no evidence/i
  assert(limits.some(text => caller.test(text) && unknown.test(text)), 'limits must explain why callers or external implementations cannot be identified')
  const assertions = [...readings, ...limits].flatMap(text => text.split(/[。！？；;\n]|[，,]?(?:然而|但是|不过|但(?!(?:凡|是))|\bbut\b)/i))
  for (const claim of assertions.filter(text => caller.test(text))) {
    const concrete = /(?:被|由|供).{1,45}(?:调用|使用)|(?:调用者|调用方)(?:包括|为|是)|(?:called|invoked|used) by|[\w.$/]+\s+(?:calls|imports)\s+[\w.$/]+/i
    assert(!concrete.test(claim) || unknown.test(claim), 'asserted an external caller without evidence')
  }
}
function verifyFactCoverage(answer) {
  const paths = new Set(answer.facts.map(fact => fact.path))
  for (const selected of SOURCES) assert(paths.has(selected.path), 'facts must cover ' + selected.path)
  const referencedLines = new Set()
  for (const claim of [...answer.summary, ...answer.relations, ...answer.tradeoffs, ...answer.flows.flatMap(flow => flow.steps)]) {
    for (const index of claim.facts) {
      const fact = answer.facts[index - 1]
      for (let line = fact.start_line; line <= fact.end_line; line++) referencedLines.add(fact.path + ':' + line)
    }
  }
  assert([...SOURCES].every(selected => [...Array(selected.last - selected.first + 1)].some((_, offset) => referencedLines.has(selected.path + ':' + (selected.first + offset)))), 'claims must reference each selected file')
}
export function verifyModuleAnswer(answer, snapshot) {
  assert(answer && typeof answer === 'object')
  assert.equal(answer.snapshot_id, snapshot)
  assert.equal(answer.commit, COMMIT)
  assert.equal(answer.tree, TREE, 'tree binding')
  for (const name of ['provider', 'model']) assert.equal(typeof answer[name] === 'string' && !!answer[name].trim(), true, 'missing ' + name)
  const expectedSources = SOURCES.map(item => ({ path: item.path, commit: COMMIT, blob_sha: item.blob, start_line: item.first, end_line: item.last, total_lines: FILES.find(file => file.path === item.path).lines.length }))
  assert.deepEqual(answer.sources, expectedSources, 'fixed module sources')
  assert(Array.isArray(answer.facts) && answer.facts.length > 0 && answer.facts.length <= 18)
  const seen = new Set()
  for (const fact of answer.facts) {
    assert(sourceByPath(fact.path), 'fact path')
    const selected = sourceByPath(fact.path)
    assert(Number.isSafeInteger(fact.start_line) && fact.start_line >= selected.first)
    assert(Number.isSafeInteger(fact.end_line) && fact.end_line >= fact.start_line && fact.end_line <= selected.last)
    assert.equal(fact.quote, quote(fact.path, fact.start_line, fact.end_line), 'source fact must be verbatim')
    const key = fact.path + ':' + fact.start_line + ':' + fact.end_line
    assert(!seen.has(key), 'duplicate fact'); seen.add(key)
  }
  validReferences(answer.summary, answer.facts, 'summary')
  validReferences(answer.relations, answer.facts, 'relations')
  validReferences(answer.tradeoffs, answer.facts, 'tradeoffs')
  assert(Array.isArray(answer.flows) && answer.flows.length > 0, 'flows')
  for (const flow of answer.flows) {
    assert(typeof flow.name === 'string' && flow.name.trim())
    assert(Array.isArray(flow.steps) && flow.steps.length > 0)
    validReferences(flow.steps, answer.facts, 'flow steps')
  }
  assert(Array.isArray(answer.limits) && answer.limits.length > 0 && answer.limits.every(text => typeof text === 'string' && text.trim()))
  verifyFactCoverage(answer)
  const readings = [allClaimText(answer)]
  const text = readings[0]
  assert(/submit|入口|订单/.test(text), 'answer must explain the entry responsibility')
  assert(/service\.save|服务|业务/.test(text), 'answer must explain the service boundary')
  assert(/store\.insert|存储|数据库|database\.run/.test(text), 'answer must explain the storage path')
  assert(/INVALID_ORDER|订单.*(?:id|标识|编号)|订单.*(?:校验|验证)|校验.*订单/.test(text), 'answer must explain the validation failure')
  verifyCallerBoundary(readings, answer.limits.map(clean))
  const encoded = JSON.stringify(answer)
  for (const outside of [UNPINNED_PATH, UNPINNED_BLOB, '# module fixture']) assert(!encoded.includes(outside), 'answer includes unselected source')
}
