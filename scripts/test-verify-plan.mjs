#!/usr/bin/env node
/** Exercise plan gates in temporary copies; never mark product tests as executed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { candidateFacts, integrationCases } from './integrated-case-proof.mjs';

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
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const imageFixtures = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAsTj2FAAAAABJRU5ErkJggg==',
].map(s => Buffer.from(s, 'base64'));
const usage = attempts => ({attempts, reported_input_tokens: attempts, reported_output_tokens: 0,
  unknown_cost_calls: attempts, known_estimated_usd: 0, budget_warning: false});
const fileDigest = path => digest(readFileSync(join(temporary, path)));
const editRecord = (p, change) => {
  const value = JSON.parse(readFileSync(join(temporary, p), 'utf8'));
  change(value);
  save(p, value);
};

// Synthetic records only in the disposable checkout; no runner, Host or model is invoked.
function complete(ctx, id, candidate = sha) {
  const u = unit(ctx, id), ids = u.test_obligations.map(t => t.id);
  const p = records(id), binding = {unit_id: id, candidate_sha: candidate};
  const proof = {...binding, passed_test_ids: ids, independent_status: 'PASS', independent_record: p.independent};
  Object.assign(u, {status: 'passed', candidate_commit: candidate, acceptance_record: p.acceptance, evidence_paths: [p.acceptance],
    test_result_status: 'PASS', independent_review_status: 'PASS', retest_status: 'PASS', completed_test_ids: ids,
    open_review_items: [], closed_review_items: [...(u.required_review_item_ids ?? [])], completed_at: startedAt});
  if (ctx.state.active_unit === id) ctx.state.unit_state = 'passed';
  save(p.independent, {...binding, status: 'PASS', exit: 0, command: 'synthetic test only', results: ids.map(id => ({id, status: 'PASS'}))});
  if (id === 'FND-005') {
    Object.assign(u, {real_provider_status: 'PASS', real_provider_evidence: p.provider, blocked_test_ids: []});
    const route = {provider: 'native', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1'};
    const tree = 'b'.repeat(40), runtime = 'c'.repeat(64), entry = 'd'.repeat(64), upstream = ctx.state.upstream_commit;
    const when = seconds => new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
    Object.assign(proof, {real_provider_record: p.provider, route_projection_record: p.provider + '.discovery.json',
      price_approval_record: p.provider + '.approval.json', reviewer_attestation_record: p.provider + '.review.json'});
    save(proof.route_projection_record, {...binding, source: 'candidate-live discover', observed_at: when(-3),
      fingerprint: digest(JSON.stringify([candidate, tree, upstream, runtime, entry])), endpoint_origin: 'https://api.deepseek.com', discovery: route});
    save(proof.price_approval_record, {...route, currency: 'USD_PER_MILLION_TOKENS', input: 1, output: 1,
      pricing_page_sha256: 'e'.repeat(64), reviewed_at: when(-2)});
    imageFixtures.forEach((bytes, i) => write(fixture + 'revision-' + (i + 1) + '.png', bytes));
    save(p.provider, {...binding, tree, upstream, runtime_sha256: runtime, entry_sha256: entry, loader_sha256: entry,
      category: 'REAL_DEEPSEEK_UI_HTTP_SQLITE', status: 'PASS', phase: 'COMPLETE', provider: route.provider, model: route.model,
      price_approval_sha256: fileDigest(proof.price_approval_record), started_at: when(-1), finished_at: when(0), host_pid: 123,
      prepare_requests: 2, native_dispatches: 2, successful_model_selections: 2,
      operations: ['knowledgeos_read_object', 'knowledgeos_update_object'].map((tool, i) => ({tool, object_id: '00000000-0000-4000-8000-000000000001',
        revision: i + 1, receipts: i, http_reread_agrees: true, ui_reread_and_sql_agree: true,
        http_revision: i + 1, http_response_sha256: digest('fixture response ' + i), http_body_sha256: digest(['Synthetic baseline', 'Synthetic committed update'][i]),
        usage_before: usage(i), usage_after: usage(i + 1), screenshot: 'revision-' + (i + 1) + '.png', screenshot_sha256: digest(imageFixtures[i])}))});
    save(proof.reviewer_attestation_record, {...binding, category: 'INDEPENDENT_REVIEWER_ATTESTATION', status: 'PASS',
      reviewer: 'test-only reviewer', findings: 'Structural fixture only.', reviewed_at: when(1),
      real_provider_sha256: fileDigest(p.provider), route_projection_sha256: fileDigest(proof.route_projection_record), independent_sha256: fileDigest(p.independent)});
  }
  save(p.acceptance, proof);
}
function certifyCase(ctx, id) {
  const owner = ctx.catalog.units.find(u => u.final_acceptance_ids.includes(id));
  const p = fixture + id + '.json';
  save(p, {case_id: id, unit_id: owner.id, candidate_sha: owner.candidate_commit, status: 'PASS', exit: 0, command: 'synthetic full case'});
  Object.assign(ctx.matrix.acceptance_cases.find(c => c.id === id), {status: 'PASS', evidence_paths: [p]});
}
const git = (...args) => execFileSync('git', args, {cwd: temporary, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const fixtureSource = 'packages/knowledgeos-panel/src/plan-gate-fixture.txt';
let historical, laterParticipant, integrated, laterIntegration, outside;
function fixtureCommit(label) {
  write(fixtureSource, label);
  git('add', '--', fixtureSource);
  const tree = git('write-tree');
  return git('-c', 'user.name=Plan Gate Fixture', '-c', 'user.email=synthetic@example.invalid',
    'commit-tree', tree, '-p', git('rev-parse', 'HEAD'), '-m', label);
}
function initializeFixtureHistory() {
  git('read-tree', 'HEAD');
  const advance = label => {
    const commit = fixtureCommit(label);
    git('update-ref', 'HEAD', commit);
    return commit;
  };
  historical = advance('accepted owner and early participants');
  laterParticipant = advance('accepted late participant');
  integrated = advance('frozen integrated candidate');
  outside = fixtureCommit('candidate outside branch HEAD');
  laterIntegration = advance('another integrated candidate');
}
const late = new Map([['A09','READ-003'],['P03','LEARN-003'],['P08','SCORE-001'],['A16','LIFE-001'],['A34','SEARCH-001'],['A46','EXPORT-001']]);
function certifyIntegrated(ctx, id, candidate = integrated) {
  const policy = integrationCases.get(id);
  const owner = ctx.catalog.units.find(u => u.final_acceptance_ids.includes(id));
  const participants = policy.units.map(unit_id => ({unit_id, candidate_sha: unit(ctx, unit_id).candidate_commit}));
  const {ancestor, ...fingerprint} = candidateFacts(temporary, candidate);
  const binding = {case_id: id, unit_id: owner.id, candidate_sha: candidate, ...fingerprint, participants};
  const proof = {schema: 'integrated-case-v1', ...binding};
  for (const kind of ['main', 'independent', 'regression']) {
    const path = fixture + `${id}-${kind}.json`;
    const artifact = path + '.txt';
    write(artifact, `Synthetic ${id} ${kind} artifact; not a product run.`);
    save(path, {...binding, kind, run_id: id + '-' + kind, status: 'PASS', exit: 0, command: 'synthetic only', environment: 'fixture',
      inputs: 'synthetic only', runner: kind, results: (kind === 'regression' ? ['affected-path'] : policy.checks)
        .map(id => ({id, status: 'PASS', actual: 'synthetic only'})), artifacts: [{path: artifact, sha256: fileDigest(artifact)}]});
    proof[kind] = {path, sha256: fileDigest(path)};
  }
  const path = fixture + id + '.json';
  save(path, proof);
  Object.assign(ctx.matrix.acceptance_cases.find(c => c.id === id), {status: 'PASS', evidence_paths: [path]});
  return path;
}
function completeIntegratedUnits(ctx, id) {
  const visit = unitId => {
    const u = unit(ctx, unitId);
    if (u.status === 'passed') return;
    u.depends_on.forEach(visit);
    complete(ctx, unitId, unitId === late.get(id) ? laterParticipant : historical);
  };
  integrationCases.get(id).units.forEach(visit);
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
  ['harness cannot attest independence', r => { r.independent = true; }, 'unexpected evidence field'],
  ['wrong live provider', r => { r.provider = 'api'; }, 'live route differs'],
  ['wrong live model', r => { r.model = 'deepseek-historical'; }, 'live route differs'],
  ['different build', r => { r.entry_sha256 = r.loader_sha256 = 'f'.repeat(64); }, 'discovery and live build differ'],
  ['loader hash differs', r => { r.loader_sha256 = 'f'.repeat(64); }, 'loaded entry differs'],
  ['wrong HTTP revision', r => { r.operations[1].http_revision = 1; }, 'HTTP revision differs'],
  ['missing response hash', r => { delete r.operations[0].http_response_sha256; }, 'missing HTTP response digest'],
  ['same response at both revisions', r => { r.operations[1].http_response_sha256 = r.operations[0].http_response_sha256; }, 'HTTP responses must differ'],
  ['incorrect reread body digest', r => { r.operations[1].http_body_sha256 = r.operations[0].http_body_sha256; }, 'authenticated reread body mismatch'],
  ['screenshot outside export', r => { r.operations[0].screenshot = '../revision-1.png'; }, 'unexpected screenshot reference'],
  ['screenshot digest mismatch', r => { r.operations[0].screenshot_sha256 = '1'.repeat(64); }, 'screenshot digest mismatch'],
  ['wrong usage attempts', r => { r.operations[0].usage_before.attempts++; }, 'usage attempt mismatch'],
  ['extra raw usage field', r => { r.operations[0].usage_after.raw = 'fixture'; }, 'unexpected evidence field'],
  ['fractional usage', r => { r.operations[0].usage_after.reported_output_tokens = 0.5; }, 'invalid observed usage count'],
  ['impossible unknown cost', r => { r.operations[0].usage_after.unknown_cost_calls = 2; }, 'invalid estimated or unknown cost'],
  ['negative estimated price', r => { r.operations[0].usage_after.known_estimated_usd = -1; }, 'invalid estimated or unknown cost'],
  ['missing budget warning', r => { delete r.operations[1].usage_before.budget_warning; }, 'missing budget warning state'],
  ['usage totals move backwards', r => { r.operations[1].usage_after.reported_input_tokens = 0; }, 'usage totals decreased'],
  ['usage discontinuity between operations', r => { r.operations[1].usage_before.reported_input_tokens = 0; }, 'usage totals decreased between operations'],
  ['additional prepare', r => { r.prepare_requests++; }, 'expected two prepares'],
  ['missing dispatch', r => { r.native_dispatches--; }, 'expected two native dispatches'],
  ['missing successful selection', r => { r.successful_model_selections--; }, 'expected two successful model selections'],
  ['bad receipt count', r => { r.operations[1].receipts++; }, 'unexpected mutation receipts'],
  ['wrong revision', r => { r.operations[1].revision--; }, 'unexpected object revision'],
  ['wrong object', r => { r.operations[1].object_id = 'other'; }, 'provider object mismatch'],
  ['no authenticated reread', r => { delete r.operations[1].http_reread_agrees; }, 'authenticated HTTP reread missing'],
  ['UI reread disagrees', r => { r.operations[1].ui_reread_and_sql_agree = false; }, 'UI reread differs'],
]) test(name, c => { complete(c, 'FND-005'); editRecord(provider, change); }, reason);
const discover = provider + '.discovery.json', approval = provider + '.approval.json', review = provider + '.review.json';
for (const [name, path, change, reason] of [
  ['projection from another candidate', discover, d => { d.candidate_sha = 'f'.repeat(40); }, 'candidate commit mismatch'],
  ['self-declared route', discover, d => { d.source = 'live summary'; }, 'native discovery required'],
  ['synthetic model', discover, d => { d.discovery.model = 'deepseek-synthetic'; }, 'expected native DeepSeek route'],
  ['fixture provider', discover, d => { d.discovery.provider = 'fixture'; }, 'expected native DeepSeek route'],
  ['non-DeepSeek model', discover, d => { d.discovery.model = 'other'; }, 'expected native DeepSeek route'],
  ['unapproved origin', discover, d => { d.endpoint_origin = 'https://example.invalid'; d.discovery.endpoint = d.endpoint_origin; }, 'disallowed native endpoint'],
  ['credential-bearing endpoint', discover, d => { d.discovery.endpoint += '?token=test-only'; }, 'disallowed native endpoint'],
  ['raw profile field in discovery', discover, d => { d.discovery.headers = {}; }, 'unexpected evidence field'],
  ['post-run discovery', discover, d => { d.observed_at = startedAt; }, 'discovery and approval must precede'],
  ['approval not used by live run', approval, q => { q.input++; }, 'price approval digest mismatch'],
  ['missing reviewer verdict', review, r => { delete r.status; }, 'independent reviewer PASS required'],
  ['another candidate review', review, r => { r.candidate_sha = 'b'.repeat(40); }, 'candidate commit mismatch'],
  ['review before live execution', review, r => { r.reviewed_at = '2000-01-01T00:00:00Z'; }, 'review predates live run'],
  ['run edited after review', provider, r => { r.host_pid++; }, 'reviewed evidence digest mismatch'],
  ['different discovery reviewed', review, r => { r.route_projection_sha256 = 'f'.repeat(64); }, 'reviewed evidence digest mismatch'],
]) test(name, c => { complete(c, 'FND-005'); editRecord(path, change); }, reason);
test('missing capture artifact', c => {
  complete(c, 'FND-005'); rmSync(join(temporary, fixture, 'revision-2.png'));
}, 'missing sibling screenshot');
test('digest-matching non-PNG', c => {
  complete(c, 'FND-005'); write(fixture + 'revision-1.png', 'not an image');
  editRecord(provider, r => { r.operations[0].screenshot_sha256 = digest('not an image'); });
}, 'expected PNG screenshot');
// When integrated with the live harness, exercise its real offline publisher and layout.
if (existsSync(join(root, 'scripts/fnd005/candidate-live-proof.mjs'))) {
  const {publishProof} = await import('./fnd005/candidate-live-proof.mjs');
  test('offline publisher output validates without adaptation', c => {
    complete(c, 'FND-005');
    const folder = fixture + 'publisher'; mkdirSync(join(temporary, folder));
    const raw = JSON.parse(readFileSync(join(temporary, provider), 'utf8'));
    publishProof(join(temporary, folder), raw, imageFixtures);
    const published = folder + '/export/proof.json';
    unit(c, 'FND-005').real_provider_evidence = published;
    editRecord(records('FND-005').acceptance, p => { p.real_provider_record = published; });
    editRecord(review, r => { r.real_provider_sha256 = fileDigest(published); });
  });
}
test('independently reviewed native relay without historical provider/model IDs', c => {
  complete(c, 'FND-005');
  const route = {provider: 'native-relay', model: 'deepseek-chat/channel', endpoint: 'https://tokease.cn/v1'};
  editRecord(discover, d => { d.endpoint_origin = 'https://tokease.cn'; d.discovery = route; });
  editRecord(approval, q => { delete q.pricing_page_sha256; Object.assign(q, route, {billing_group: 'default'}); });
  editRecord(provider, r => Object.assign(r, {provider: route.provider, model: route.model, price_approval_sha256: fileDigest(approval)}));
  editRecord(review, r => Object.assign(r, {real_provider_sha256: fileDigest(provider), route_projection_sha256: fileDigest(discover)}));
});
test('approved endpoint differs even with matching live price digest', c => {
  complete(c, 'FND-005');
  editRecord(approval, q => { q.endpoint = 'https://tokease.cn/v1'; });
  editRecord(provider, r => { r.price_approval_sha256 = fileDigest(approval); });
  editRecord(review, r => { r.real_provider_sha256 = fileDigest(provider); });
}, 'approved route differs from discovery');
test('live summary cannot double as independent review', c => {
  complete(c, 'FND-005'); editRecord(records('FND-005').acceptance, p => { p.reviewer_attestation_record = provider; });
}, 'separate evidence records required');
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
for (const [id, unitId] of late) {
  test(id + ' integrated proof preserves early owner SHA', c => {
    completeIntegratedUnits(c, id);
    certifyIntegrated(c, id);
  });
  test(id + ' requires actual participation by ' + unitId, c => {
    completeIntegratedUnits(c, id);
    editRecord(certifyIntegrated(c, id), p => { p.participants = p.participants.filter(x => x.unit_id !== unitId); });
  }, 'required participant missing: ' + unitId);
}
const a09Proof = (c, candidate) => { completeIntegratedUnits(c, 'A09'); return certifyIntegrated(c, 'A09', candidate); };
const changeRun = (path, kind, change) => editRecord(path, p => {
  editRecord(p[kind].path, change);
  p[kind].sha256 = fileDigest(p[kind].path);
});
test('old single-owner schema rejected for a cross-unit case', c => {
  completeIntegratedUnits(c, 'A09');
  certifyCase(c, 'A09');
}, 'requires one integrated case proof');
test('cannot integrate an unaccepted component', c => {
  const id = 'P08';
  completeIntegratedUnits(c, id);
  certifyIntegrated(c, id);
  unit(c, 'SCORE-001').status = 'planned';
}, 'participant not passed: SCORE-001');
test('integration candidate outside branch rejected', c => {
  editRecord(a09Proof(c), p => { p.candidate_sha = outside; });
}, 'integration candidate is not in branch history');
test('owner candidate alone omits role accepted later', c => {
  a09Proof(c, historical);
}, 'integration candidate excludes accepted READ-003');
test('changed historical participant candidate rejected', c => {
  editRecord(a09Proof(c), p => { p.participants.find(u => u.unit_id === 'READ-003').candidate_sha = integrated; });
}, 'changed historical participant candidate: READ-003');
for (const key of ['tree','source_tree','entry_sha256','build_sha256']) {
  test('wrong integration ' + key, c => {
    editRecord(a09Proof(c), p => { p[key] = 'f'.repeat(p[key].length); });
  }, 'integration ' + key + ' mismatch');
}
test('prior actual main run not reusable on new integrated commit', c => {
  a09Proof(c);
  const old = readFileSync(join(temporary, fixture + 'A09-main.json'));
  const path = certifyIntegrated(c, 'A09', laterIntegration);
  const priorPath = fixture + 'A09-old-main.json';
  write(priorPath, old);
  editRecord(path, p => { p.main = {path: priorPath, sha256: fileDigest(priorPath)}; });
}, 'main candidate_sha mismatch');
for (const [kind, field, value, error] of [
  ['main', 'status', 'FAIL', 'main not passed'],
  ['independent', 'status', 'NOT_RUN', 'independent not passed'],
  ['regression', 'exit', 1, 'regression nonzero exit'],
  ['independent', 'runner', 'main', 'independent runner equals main runner'],
  ['independent', 'run_id', 'A09-main', 'independent requires a distinct run ID'],
]) test(`integrated ${kind} rejects ${field} ${value}`, c => {
  changeRun(a09Proof(c), kind, run => { run[field] = value; });
}, error);
test('integrated case cannot omit a negative path or treat NOT_RUN as PASS', c => {
  changeRun(a09Proof(c), 'main', run => { run.results = run.results.filter(r => r.id !== 'VISIBLE_PARSED_ONLY'); });
}, 'main missing assertion: VISIBLE_PARSED_ONLY');
test('PASS overall cannot conceal a skipped assertion', c => {
  changeRun(a09Proof(c), 'main', run => { run.results[0].status = 'NOT_RUN'; });
}, 'main missing successful observations');
test('changed execution record bytes rejected', c => {
  a09Proof(c);
  editRecord(fixture + 'A09-main.json', r => { r.inputs += ' changed'; });
}, 'main evidence hash mismatch');
test('changed screenshot or trace bytes rejected', c => {
  a09Proof(c);
  write(fixture + 'A09-main.json.txt', 'changed');
}, 'main artifact digest mismatch');
test('copied main artifact does not constitute independent evidence', c => {
  const path = a09Proof(c);
  const copy = fixture + 'A09-copy.txt';
  write(copy, readFileSync(join(temporary, fixture + 'A09-main.json.txt')));
  changeRun(path, 'independent', run => { run.artifacts = [{path: copy, sha256: fileDigest(copy)}]; });
}, 'requires at least one run-specific artifact');
function finalFixture(c) {
  for (const u of c.catalog.units) if (u.status !== 'passed') complete(c, u.id, historical);
  activate(c, 'CHECK-004', 'passed');
  for (const item of c.matrix.acceptance_cases) {
    if (integrationCases.has(item.id)) certifyIntegrated(c, item.id);
    else certifyCase(c, item.id);
  }
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
  // Preserve real history for the supplied-plan test; synthesize candidates only in this clone.
  git('clone', '--shared', '--no-checkout', '--', root, '.');
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
    if (i === 0) initializeFixtureHistory();
  }
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
}
process.stdout.write(JSON.stringify({
  status: 'PASS', scope: 'plan_gate_regressions_only', started_at: startedAt,
  finished_at: new Date().toISOString(), checks: outcomes.length, results: outcomes,
  realProjectStatesModified: false, implementationVerifiedByThisCheck: false, productTestsExecuted: 0,
}, null, 2) + '\n');
