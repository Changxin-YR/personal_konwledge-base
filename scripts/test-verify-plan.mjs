#!/usr/bin/env node
/** Exercise plan gates in temporary copies; never mark product tests as executed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const temporary = mkdtempSync(join(tmpdir(), 'knowledgeos-plan-gates-'));
const outcomes = [];
const statePath = 'config/execution_state.json';
const catalogPath = 'config/work_units.json';
const matrixPath = 'config/requirements_matrix.json';
const promptPath = 'CODEX_START.md';
const fixture = 'synthetic-plan-fixtures/';
const sha = 'a'.repeat(40);
const baseline = path => readFileSync(join(root, path), 'utf8');
const json = path => JSON.parse(baseline(path));
const write = (path, data) => {
  mkdirSync(dirname(join(temporary, path)), { recursive: true });
  writeFileSync(join(temporary, path), data);
};
const save = (path, data) => write(path, JSON.stringify(data, null, 2) + '\n');
const unit = (ctx, id) => ctx.catalog.units.find(u => u.id === id);
const activate = (ctx, id, state) => {
  ctx.state.active_unit = id;
  ctx.state.unit_state = state;
  unit(ctx, id).status = state === 'ready' ? 'planned' : state;
};
const editPrompt = (ctx, edit) => {
  ctx.prompt = edit(ctx.prompt);
  ctx.state.active_instruction.sha256 = createHash('sha256').update(ctx.prompt).digest('hex');
};
const records = id => ({acceptance: fixture + id + '-acceptance.json', independent: fixture + id + '-independent.json', provider: fixture + id + '-provider.json'});
const editRecord = (p, change) => {
  const value = JSON.parse(readFileSync(join(temporary, p), 'utf8'));
  change(value);
  save(p, value);
};

// Synthetic records only in the disposable checkout; no runner, Host or model is invoked.
function complete(ctx, id) {
  const u = unit(ctx, id), ids = u.test_obligations.map(t => t.id);
  const p = records(id), binding = {unit_id: id, candidate_sha: sha};
  const proof = {...binding, passed_test_ids: ids, independent_status: 'PASS', independent_record: p.independent};
  Object.assign(u, {status: 'passed', candidate_commit: sha, acceptance_record: p.acceptance, evidence_paths: [p.acceptance],
    test_result_status: 'PASS', independent_review_status: 'PASS', retest_status: 'PASS', completed_test_ids: ids,
    open_review_items: [], closed_review_items: [...(u.required_review_item_ids ?? [])], completed_at: startedAt});
  if (ctx.state.active_unit === id) ctx.state.unit_state = 'passed';
  save(p.independent, {...binding, status: 'PASS', exit: 0, command: 'synthetic test only', results: ids.map(id => ({id, status: 'PASS'}))});
  if (id === 'FND-005') {
    Object.assign(u, {real_provider_status: 'PASS', real_provider_evidence: p.provider, blocked_test_ids: []});
    proof.real_provider_record = p.provider;
    save(p.provider, {...binding, independent: true, category: 'REAL_DEEPSEEK_UI_HTTP_SQLITE', status: 'PASS', provider: 'api', model: 'deepseek-v4.1-flash-1017/hs14',
      upstream: ctx.state.upstream_commit, plugin_sha256: 'f'.repeat(64), loaded_plugin_sha256: 'f'.repeat(64),
      prepare_requests: 2, successful_model_selections: 2, price_basis: {conservative_reservation_not_actual_invoice: true},
      operations: ['knowledgeos_read_object', 'knowledgeos_update_object'].map((tool, i) => ({tool, object_id: 'fixture', revision: i + 1, receipts: i,
        body_sha256: String(i).repeat(64), ui_reread_and_sql_agree: true, authenticated_http_status: 200, http_revision: i + 1, http_body_sha256: String(i).repeat(64)}))});
  }
  save(p.acceptance, proof);
}
function certifyCase(ctx, id) {
  const owner = ctx.catalog.units.find(u => u.final_acceptance_ids.includes(id));
  const p = fixture + id + '.json';
  save(p, {case_id: id, unit_id: owner.id, candidate_sha: owner.candidate_commit, status: 'PASS', exit: 0, command: 'synthetic full case'});
  Object.assign(ctx.matrix.acceptance_cases.find(c => c.id === id), {status: 'PASS', evidence_paths: [p]});
}
function history(ctx, change) {
  const u = unit(ctx, 'FND-006'), proof = json(u.acceptance_record);
  change(proof);
  u.acceptance_record = fixture + 'historical-copy.json';
  save(u.acceptance_record, proof);
}
const tests = [];
const test = (name, change, reason = null) => tests.push({name, change, reason});
test('supplied plan', () => {});
for (const status of ['ready', 'in_progress', 'blocked', 'failed']) test('eligible dynamic active unit: ' + status, c => activate(c, 'LIB-001', status));
test('blocked prerequisite prevents selection', c => activate(c, 'AI-001', 'ready'), 'dependency not passed: FND-005');
test('inactive passed unit cannot skip prerequisites', c => complete(c, 'LIB-002'), 'dependency not passed: LIB-001');
test('unknown active unit', c => { c.state.active_unit = null; }, 'active unit is not in the catalog');
test('retired state', c => { c.state.unit_state = 'awaiting_user'; }, 'invalid execution unit_state');
test('state mismatch', c => { c.state.unit_state = 'ready'; }, 'execution state and unit outcome disagree');
test('second writer', c => { activate(c, 'LIB-001', 'in_progress'); unit(c, 'REPO-001').status = 'in_progress'; }, 'another feature is being developed');
test('cycle in inactive subgraph', c => { unit(c, 'LIB-001').depends_on.push('LIB-002'); }, 'unit dependency cycle');
test('unknown dependency', c => { unit(c, 'LIB-001').depends_on.push('MISSING'); }, 'invalid dependency');
test('duplicate dependency', c => { unit(c, 'LIB-001').depends_on.push('FND-004'); }, 'duplicate dependency');
test('no final case owner', c => { unit(c, 'FND-005').final_acceptance_ids = []; }, 'complete case A01 needs one final owner');
test('prompt hash drift', c => { c.prompt += 'changed\n'; }, 'active prompt content changed');
test('stale active unit metadata despite matching hash', c => editPrompt(c, s => s.replace('auto_advance:', 'active_unit: "FND-006"\nauto_advance:')), 'prompt must not pin active_unit');
test('wrong unit source despite matching hash', c => editPrompt(c, s => s.replace('active_unit_source: "config/execution_state.json"', 'active_unit_source: "elsewhere"')), 'prompt metadata disagrees: active_unit_source');
test('missing catalog reference', c => editPrompt(c, s => s.replaceAll('config/work_units.json', 'config/execution_state.json')), 'prompt must reference the work catalog');
test('retired root prompt', () => write('DSH_START.md', '# Retired\n'), 'only one root executable prompt');
test('coherent rollback of auto advance', c => { c.state.auto_advance = false; c.catalog.rules.allow_cross_unit_auto_advance = false; }, 'continuous execution requires automatic advance');
test('rollback of executor', c => { c.state.executor = c.catalog.current_executor = 'deepseek_harness'; }, 'single current instruction');
test('rollback of phase', c => { c.state.execution_phase = 'codex_foundation'; }, 'single current instruction');
test('stale revision', c => { c.state.instruction_revision = '3.4.0'; }, 'single current instruction');
test('changed migration anchor', c => { c.state.base_commit = sha; }, 'migration anchor changed');
test('wrong catalog role', c => { c.catalog.rules.codex_role = 'old'; }, 'work catalog scope');
test('parallel implementation enabled', c => { c.catalog.rules.allow_parallel_feature_implementation = true; }, 'work catalog scope');
test('extra writers allowed', c => { c.catalog.rules.max_implementation_writers = c.state.max_product_code_writers = 2; }, 'single current instruction');
test('premature product review', c => { c.state.codex_review.state = 'active'; }, 'full product review prerequisites');
test('accepted prerequisite reopened', c => { unit(c, 'FND-002').status = 'failed'; }, 'FND-002 acceptance must remain passed');
test('historical R2 closure removed', c => { unit(c, 'FND-002').closed_review_items = ['R1']; }, 'FND-002 R1/R2 need historical closure');
test('historical FND-006 reopened', c => { unit(c, 'FND-006').status = 'failed'; }, 'FND-006 acceptance must remain passed');
test('historical FND-006 obligation removed', c => { unit(c, 'FND-006').test_obligations.pop(); }, 'FND-006 requires exactly T01-T08');
test('historical FND-006 run from another tree', c => history(c, proof => {
  const r = json(proof.jobs_record); r.after.tree = sha; proof.jobs_record = fixture + 'jobs.json'; save(proof.jobs_record, r);
}), 'independent runs must match frozen tree');
test('historical FND-006 unverified Host', c => history(c, proof => {
  const r = json(proof.regression_record); r.load_verified = false; proof.regression_record = fixture + 'regress.json'; save(proof.regression_record, r);
}), 'actual Host binding required');
test('deleted prerequisite in acyclic catalog', c => { unit(c, 'LIB-001').depends_on = ['FND-004']; }, 'documented dependencies differ: LIB-001');
test('document row missing', () => write(planPath, baseline(planPath).replace(/^\| LIB-001 \|.*$/m, '')), 'implementation plan must document all 76 units');
test('accepted candidate can become inactive', c => { complete(c, 'LIB-001'); activate(c, 'LIB-002', 'ready'); });
for (const [name, change, reason] of [
  ['open finding', u => { u.open_review_items = ['R1']; }, 'open findings prevent completion'],
  ['unclosed required finding', u => { u.required_review_item_ids = ['R']; }, 'missing required review closure'],
  ['failed tests', u => { u.test_result_status = 'FAIL'; }, 'test_result_status must be PASS'],
  ['no independent review', u => { u.independent_review_status = 'NOT_RUN'; }, 'independent_review_status must be PASS'],
  ['missing retest', u => { u.retest_status = 'NOT_RUN'; }, 'retest_status must be PASS'],
  ['duplicate test', u => { u.completed_test_ids[1] = u.completed_test_ids[0]; }, 'completion requires exactly the catalog tests'],
  ['invalid timestamp', u => { u.completed_at = 'not a time'; }, 'completion needs a valid timestamp'],
  ['missing evidence', u => { u.evidence_paths = []; }, 'evidence paths required'],
  ['non-file evidence', u => { u.evidence_paths = ['docs/evidence']; }, 'expected local evidence file'],
  ['mismatched unit SHA', u => { u.candidate_commit = 'b'.repeat(40); }, 'candidate commit mismatch'],
]) test('inactive candidate: ' + name, c => { complete(c, 'LIB-001'); change(unit(c, 'LIB-001')); }, reason);
for (const [name, key, change, reason] of [
  ['missing acceptance test', 'acceptance', p => p.passed_test_ids.pop(), 'acceptance must cover every catalog test'],
  ['cross-candidate independent run', 'independent', p => { p.candidate_sha = 'b'.repeat(40); }, 'candidate commit mismatch'],
  ['other unit run', 'independent', p => { p.unit_id = 'FND-006'; }, 'candidate unit mismatch'],
  ['nonzero exit', 'independent', p => { p.exit = 1; }, 'independent run exit must be zero'],
  ['missing independent test', 'independent', p => p.results.pop(), 'independent result coverage mismatch'],
  ['failed individual test', 'independent', p => { p.results[0].status = 'FAIL'; }, 'independent test failed'],
]) test(name, c => { complete(c, 'LIB-001'); editRecord(records('LIB-001')[key], change); }, reason);
const provider = records('FND-005').provider;
test('same-candidate independent DeepSeek proof (structure only)', c => complete(c, 'FND-005'));
test('pre-fix HS14 proof cannot certify new candidate', c => {
  complete(c, 'FND-005'); const u = unit(c, 'FND-005'); u.real_provider_evidence = 'docs/evidence/FND-005/live-hs14-Oaxv9B/summary.json';
  editRecord(u.acceptance_record, p => { p.real_provider_record = u.real_provider_evidence; });
}, 'candidate unit mismatch');
for (const [name, change, reason] of [
  ['old provider candidate', r => { r.candidate_sha = 'b'.repeat(40); }, 'candidate commit mismatch'],
  ['provider run not independent', r => { r.independent = false; }, 'independent provider run required'],
  ['wrong route', r => { r.model += '/fixture'; }, 'unexpected DeepSeek model route'],
  ['unbound loaded Host', r => { delete r.loaded_plugin_sha256; }, 'loaded Host plugin differs'],
  ['additional prepare', r => { r.prepare_requests++; }, 'expected two prepares'],
  ['missing successful selection', r => { r.successful_model_selections--; }, 'expected two successful model selections'],
  ['bad receipt count', r => { r.operations[1].receipts++; }, 'unexpected mutation receipts'],
  ['wrong reread revision', r => { r.operations[1].http_revision--; }, 'HTTP revision differs'],
  ['wrong object', r => { r.operations[1].object_id = 'other'; }, 'provider object mismatch'],
  ['no authenticated reread', r => { delete r.operations[1].authenticated_http_status; }, 'authenticated HTTP reread missing'],
  ['different reread content', r => { r.operations[0].http_body_sha256 = 'b'.repeat(64); }, 'HTTP content differs'],
  ['UI reread disagrees', r => { r.operations[1].ui_reread_and_sql_agree = false; }, 'UI reread differs'],
  ['estimated price mislabeled', r => { r.price_basis.conservative_reservation_not_actual_invoice = false; }, 'pricing estimate must not be represented as an invoice'],
]) test(name, c => { complete(c, 'FND-005'); editRecord(provider, change); }, reason);
test('case requires passed owner', c => certifyCase(c, 'A07'), 'final owner has not passed');
function acceptedCase(c) {
  complete(c, 'LIB-001'); complete(c, 'LIB-003'); complete(c, 'LIB-004'); certifyCase(c, 'A08');
  Object.assign(c.matrix.requirements.find(r => r.id === 'F08'), {implementation_status: 'verified', evidence_paths: [fixture + 'A08.json']});
}
test('full case and associated requirement with owner proof', acceptedCase);
for (const [key, value] of [['case_id', 'A09'], ['unit_id', 'LIB-001'], ['candidate_sha', 'c'.repeat(40)], ['status', 'FAIL'], ['exit', 1]]) {
  test('incorrect full case ' + key, c => { acceptedCase(c); editRecord(fixture + 'A08.json', r => { r[key] = value; }); }, 'missing case execution proof');
}
test('requirement verified prematurely', c => { acceptedCase(c); c.matrix.acceptance_cases.find(x => x.id === 'A08').status = 'NOT_RUN'; }, 'verified requires every linked case PASS');
function finalFixture(c) {
  for (const u of c.catalog.units) if (u.status !== 'passed') complete(c, u.id);
  activate(c, 'CHECK-004', 'passed');
  for (const item of c.matrix.acceptance_cases) certifyCase(c, item.id);
}
test('complete final structure', finalFixture);
test('final acceptance with outstanding case', c => { finalFixture(c); c.matrix.acceptance_cases[0].status = 'BLOCKED'; }, 'CHECK-004 requires every complete case PASS');
test('final acceptance with unfinished unrelated unit', c => {
  finalFixture(c);
  const dependencies = new Set();
  const visit = id => { if (!dependencies.has(id)) { dependencies.add(id); unit(c, id).depends_on.forEach(visit); } };
  visit('CHECK-004');
  const other = c.catalog.units.find(u => !dependencies.has(u.id) && !c.catalog.units.some(v => v.depends_on.includes(u.id)));
  assert(other, 'fixture needs a unit outside CHECK-004 dependency closure');
  other.status = 'blocked';
}, 'CHECK-004 requires every other unit passed');

const planPath = 'docs/plan/06_IMPLEMENTATION_PLAN.md';
try {
  cpSync(root, temporary, {recursive: true, filter: p => !['.git', '.cache', 'node_modules', '.worktrees'].includes(basename(p))});
  for (const [i, {name, change, reason}] of tests.entries()) {
    const ctx = {state: json(statePath), catalog: json(catalogPath), matrix: json(matrixPath), prompt: baseline(promptPath)};
    if (i > 0) {
      // Replay migration-day scenarios even after the real queue moves on. Never change source evidence.
      for (const u of ctx.catalog.units) if (!['FND-001', 'FND-002', 'FND-003', 'FND-004', 'FND-006'].includes(u.id)) u.status = 'planned';
      for (const item of ctx.matrix.acceptance_cases) item.status = 'NOT_RUN';
      for (const item of ctx.matrix.requirements) item.implementation_status = 'planned';
      activate(ctx, 'FND-005', 'blocked');
      ctx.state.codex_review.state = 'not_started';
    }
    write(planPath, baseline(planPath));
    if (existsSync(join(temporary, 'DSH_START.md')) && i > 0) rmSync(join(temporary, 'DSH_START.md'));
    change(ctx);
    save(statePath, ctx.state); save(catalogPath, ctx.catalog); save(matrixPath, ctx.matrix); write(promptPath, ctx.prompt);
    const result = spawnSync(process.execPath, [join(temporary, 'scripts/verify-plan.mjs')], {cwd: temporary, encoding: 'utf8', timeout: 20000});
    assert.ifError(result.error);
    const expected = reason ? 1 : 0;
    assert.equal(result.status, expected, name + ': ' + (result.stderr || result.stdout));
    if (reason) assert(result.stderr.includes(reason), name + ': unexpected rejection: ' + result.stderr);
    outcomes.push({name, status: 'PASS', expectedExitCode: expected, actualExitCode: result.status});
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify({
  status: 'PASS', scope: 'plan_gate_regressions_only', started_at: startedAt,
  finished_at: new Date().toISOString(), checks: outcomes.length, results: outcomes,
  realProjectStatesModified: false, implementationVerifiedByThisCheck: false, productTestsExecuted: 0,
}, null, 2) + '\n');
