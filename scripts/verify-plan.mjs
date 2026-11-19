#!/usr/bin/env node
/** Check the executable plan's references and traceability, not product behavior. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const matrix = JSON.parse(read('config/requirements_matrix.json'));
const lock = JSON.parse(read('config/upstream.lock.json'));
const releases = JSON.parse(read('releases/index.json'));
const execution = JSON.parse(read('config/execution_state.json'));
const catalog = JSON.parse(read('config/work_units.json'));
const activePrompt = read('CODEX_START.md');
const errors = [];
const check = (label, operation) => {
  try { operation(); } catch (error) { errors.push(`${label}: ${error.message}`); }
};

const requirementIds = new Set(matrix.requirements.map((item) => item.id));
const caseIds = new Set(matrix.acceptance_cases.map((item) => item.id));
const cases = new Map(matrix.acceptance_cases.map((item) => [item.id, item]));
const requirements = new Map(matrix.requirements.map((item) => [item.id, item]));
const phases = new Set(['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
check('requirement ids', () => {
  assert.equal(matrix.requirements.length, 44);
  assert.equal(requirementIds.size, 44);
  for (let n = 1; n <= 44; n++) assert(requirementIds.has(`F${String(n).padStart(2, '0')}`));
});
check('acceptance ids', () => {
  assert.equal(matrix.acceptance_cases.length, 66);
  assert.equal(caseIds.size, 66);
  for (const [prefix, total] of [['P', 14], ['A', 52]]) {
    for (let n = 1; n <= total; n++) assert(caseIds.has(`${prefix}${String(n).padStart(2, '0')}`));
  }
});

const requirementStates = new Set(['planned', 'in_progress', 'implemented_unverified', 'verified', 'blocked']);
const caseStates = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);
for (const item of matrix.requirements) check(item.id, () => {
  assert(phases.has(item.milestone), 'invalid primary milestone');
  assert(requirementStates.has(item.implementation_status), 'invalid implementation status');
  assert(item.owner_module && item.acceptance_ids.length, 'owner and acceptance links are required');
  assert.equal(new Set(item.acceptance_ids).size, item.acceptance_ids.length, 'duplicate acceptance links');
  for (const id of item.acceptance_ids) {
    assert(cases.get(id)?.requirement_ids.includes(item.id), `missing reciprocal case ${id}`);
  }
  if (item.implementation_status === 'verified') {
    evidenceFiles(item.evidence_paths);
    assert(item.acceptance_ids.every((id) => cases.get(id)?.status === 'PASS'), 'verified requires every linked case PASS');
  }
});
for (const item of matrix.acceptance_cases) check(item.id, () => {
  assert(phases.has(item.final_milestone), 'final milestone is required');
  assert(caseStates.has(item.status), 'invalid acceptance status');
  for (const field of ['preconditions', 'steps', 'expected', 'level', 'evidence_required']) assert(item[field], `missing ${field}`);
  for (const id of item.requirement_ids) assert(requirements.get(id)?.acceptance_ids.includes(item.id), `missing reciprocal requirement ${id}`);

});

const reqText = read('docs/plan/01_REQUIREMENTS_BASELINE.md');
const acceptanceText = read('docs/plan/07_ACCEPTANCE_MATRIX.md');
check('document coverage', () => {
  for (const id of requirementIds) assert(new RegExp(`\\b${id}\\b`).test(reqText), `requirement missing from Markdown: ${id}`);
  for (const id of caseIds) assert(new RegExp(`\\b${id}\\b`).test(acceptanceText), `case missing from Markdown: ${id}`);
  assert(matrix.milestone_semantics, 'milestone semantics missing');
});
check('upstream lock', () => {
  assert.equal(lock.upstream.repository, 'https://github.com/deepseek-ai/deepseek-harness.git');
  assert.match(lock.upstream.commit, /^[a-f0-9]{40}$/);
  assert(activePrompt.includes(lock.upstream.commit), 'active instruction and lock disagree');
  assert.equal(execution.upstream_commit, lock.upstream.commit);
});
check('release claims', () => {
  if (releases.status === 'NOT_BUILT') assert.equal(releases.releases.length, 0, 'unbuilt releases must not advertise assets');
});

const units = new Map(catalog.units.map((item) => [item.id, item]));
const finalOwners = new Map([...caseIds].map((id) => [id, []]));
const unitTestIds = new Set();
// Evidence references must resolve to files in this checkout, including after symlink resolution.
function evidenceFile(name) {
  assert(typeof name === 'string' && name.trim() && !isAbsolute(name), 'expected repository-relative evidence path');
  const rel = relative(realpathSync(root), realpathSync(resolve(root, name)));
  assert(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep) && statSync(resolve(root, name)).isFile(), 'expected local evidence file');
  return name;
}
function evidenceFiles(paths) {
  assert(Array.isArray(paths) && paths.length, 'evidence paths required');
  paths.forEach(evidenceFile);
}
const record = (name) => JSON.parse(read(evidenceFile(name)));
const sameIds = (actual, expected, message) => {
  assert(Array.isArray(actual), message);
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
};
check('single current instruction', () => {
  assert.equal(execution.executor, 'codex');
  assert.equal(execution.execution_phase, 'codex_continuous');
  assert.equal(execution.instruction_revision, '4.0.0');
  assert.equal(execution.execution_mode, 'continuous_unit_gated');
  assert.equal(execution.base_commit, '2329f9d8f37aa985c51efe8365889ff2934bb5f1', 'migration anchor changed');
  assert(activePrompt.includes(execution.base_commit), 'migration anchor missing from prompt');
  assert.equal(execution.max_active_units, 1);
  assert.equal(execution.max_product_code_writers, 1);
  assert.equal(execution.auto_advance, true, 'continuous execution requires automatic advance');
  assert.equal(execution.active_instruction.path, 'CODEX_START.md');
  assert.equal(execution.active_instruction.sha256, createHash('sha256').update(activePrompt).digest('hex'), 'active prompt content changed without its state hash');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(activePrompt)?.[1];
  assert(header, 'prompt metadata missing');
  const metadata = header.split(/\r?\n/);
  for (const [key, expected] of Object.entries({ instruction_revision: '"4.0.0"', execution_phase: '"codex_continuous"', executor: '"codex"', active_unit_source: '"config/execution_state.json"', auto_advance: 'true' })) {
    assert.deepEqual(metadata.filter(line => line.split(':')[0].trim() === key), [key + ': ' + expected], 'prompt metadata disagrees: ' + key);
  }
  assert(!metadata.some(line => line.split(':')[0].trim() === 'active_unit'), 'prompt must not pin active_unit');
  assert(activePrompt.includes('config/work_units.json'), 'prompt must reference the work catalog');
  const roots = readdirSync(root).filter((name) => /(?:START|PROMPT).*\.md$/i.test(name));
  assert.deepEqual(roots, ['CODEX_START.md'], 'only one root executable prompt is permitted');
  assert.deepEqual(execution.retired_instruction_paths, ['DSH_START.md']);
  for (const path of execution.retired_instruction_paths) assert(!existsSync(resolve(root, path)), `retired prompt still exists: ${path}`);
  assert.equal(execution.takeover.authorization, 'explicit_user_request');
  assert.equal(execution.takeover.product_host, 'deepseek_harness', 'changing the developer does not remove the product host');
  assert.equal(execution.takeover.state, 'completed_historical_phase');
  assert.equal(execution.codex_review.scope, 'full_product_review');
  if (execution.codex_review.state !== 'not_started') {
    assert(execution.active_unit === 'CHECK-004' && catalog.units.every(u => u.id === 'CHECK-004' || u.status === 'passed'), 'full product review prerequisites not passed');
    assert(['active', 'completed'].includes(execution.codex_review.state), 'invalid full product review state');
    if (execution.codex_review.state === 'completed') assert(units.get('CHECK-004').status === 'passed');
  }
  assert.equal(execution.codex_review.active_prompt, null);
});
check('work catalog scope', () => {
  assert.equal(catalog.mode, 'continuous_unit_gated');
  assert.equal(catalog.current_executor, execution.executor);
  assert.equal(catalog.only_active_prompt, execution.active_instruction.path);
  assert.equal(catalog.active_unit_source, 'config/execution_state.json');
  assert.equal(catalog.rules.max_active_units, execution.max_active_units);
  assert.equal(catalog.rules.max_implementation_writers, execution.max_product_code_writers);
  assert.equal(catalog.rules.allow_cross_unit_auto_advance, true);
  assert.equal(catalog.rules.allow_parallel_feature_implementation, false);
  assert.equal(catalog.rules.test_during_each_unit, true);
  assert.equal(catalog.rules.codex_role, 'continuous_development_and_independent_verification');
  assert.equal(catalog.catalog_is_execution_authorization, false);
  assert.equal(units.size, catalog.units.length, 'duplicate unit ids');
  assert(units.has(execution.active_unit), 'active unit is not in the catalog');
  for (const id of requirementIds) assert(catalog.units.some((item) => item.requirement_ids.includes(id)), `requirement has no work unit: ${id}`);
});
for (const item of catalog.units) check(item.id, () => {
  assert(phases.has(item.milestone));
  assert(['planned', 'in_progress', 'passed', 'failed', 'blocked'].includes(item.status), 'invalid unit status');
  assert(item.scope?.length && item.not_in_scope?.length && item.test_obligations?.length && item.completion_gate, 'unit scope/tests/gate missing');
  for (const id of item.requirement_ids) assert(requirementIds.has(id), `unknown requirement ${id}`);
  assert.equal(new Set(item.depends_on).size, item.depends_on.length, 'duplicate dependency');
  for (const id of item.depends_on) {
    assert(units.has(id) && id !== item.id, `invalid dependency ${id}`);
    if (item.status === 'passed' || item.id === execution.active_unit) {
      assert.equal(units.get(id).status, 'passed', `dependency not passed: ${id}`);
    }
  }
  for (const id of item.acceptance_ids) assert(caseIds.has(id), `unknown acceptance ${id}`);
  for (const id of item.final_acceptance_ids) {
    assert(item.acceptance_ids.includes(id), `final case ${id} must also be associated`);
    assert.equal(cases.get(id)?.final_milestone, item.milestone, `final case ${id} belongs to another milestone`);
    finalOwners.get(id).push(item.id);
  }
  for (const test of item.test_obligations) {
    assert(test.id.startsWith(`${item.id}-T`) && test.scenario && test.expected, 'unit test lacks id, behavior or expected result');
    assert(!unitTestIds.has(test.id), `duplicate local test ${test.id}`);
    unitTestIds.add(test.id);
  }
  if (item.status === 'passed') {
    if (['FND-001', 'FND-002'].includes(item.id)) {
      // These accepted reports predate file-level references and include run directories.
      assert(item.evidence_paths?.length && item.evidence_paths.every(p => existsSync(resolve(root, p))), 'historical evidence missing');
    } else evidenceFiles(item.evidence_paths);
  }
});
check('documented unit graph', () => {
  const rows = new Map();
  for (const line of read('docs/plan/06_IMPLEMENTATION_PLAN.md').split(/\r?\n/)) {
    const [, id, , deps] = line.split('|').map(cell => cell.trim());
    if (!/^\s*\|/.test(line) || !/^[A-Z]+-\d{3}$/.test(id)) continue;
    assert(!rows.has(id), 'duplicate implementation plan row: ' + id);
    rows.set(id, deps === '\u65e0' ? [] : deps.split(',').map(s => s.trim()));
  }
  assert.equal(rows.size, 76, 'implementation plan must document all 76 units');
  sameIds([...rows.keys()], [...units.keys()], 'implementation plan and catalog unit IDs differ');
  for (const [id, deps] of rows) sameIds(units.get(id).depends_on, deps, 'documented dependencies differ: ' + id);
});
check('dependency order and final owners', () => {
  for (const [id, owners] of finalOwners) assert.equal(owners.length, 1, `complete case ${id} needs one final owner`);
  const visited = new Set();
  const visiting = new Set();
  const visit = (id) => {
    assert(!visiting.has(id), `unit dependency cycle at ${id}`);
    if (visited.has(id)) return;
    assert(units.has(id), `missing dependency ${id}`);
    visiting.add(id);
    for (const dependency of units.get(id).depends_on) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of units.keys()) visit(id);
});
check('accepted foundation history', () => {
  assert.equal(units.get('FND-001')?.status, 'passed', 'FND-001 acceptance must remain passed');
  const previous = units.get('FND-002');
  assert.equal(previous?.status, 'passed', 'FND-002 acceptance must remain passed');
  assert.equal(previous.test_result_status, 'PASS', 'FND-002 accepted tests must remain PASS');
  assert.equal(previous.retest_status, 'PASS', 'FND-002 accepted retests must remain PASS');
  assert.deepEqual(previous.open_review_items, [], 'FND-002 still has open findings');
  assert(Array.isArray(previous.closed_review_items) && ['R1', 'R2'].every((id) => previous.closed_review_items.includes(id)), 'FND-002 R1/R2 need historical closure');
  assert(previous.completed_at && Number.isFinite(Date.parse(previous.completed_at)), 'FND-002 completion timestamp is missing');
  assert(previous.evidence_paths?.length && previous.evidence_paths.every((path) => existsSync(resolve(root, path))), 'FND-002 accepted evidence is missing');
  assert.equal(execution.prerequisite_acceptance.unit_id, 'FND-004');
  assert.equal(execution.prerequisite_acceptance.status, 'passed');
  const fnd3 = units.get('FND-003');
  assert.equal(fnd3?.status, 'passed', 'FND-003 acceptance must remain passed');
  assert.equal(fnd3?.test_result_status, 'PASS', 'FND-003 accepted tests must remain PASS');
  assert.equal(fnd3?.independent_review_status, 'PASS', 'FND-003 independent review must remain PASS');
  const fnd4 = units.get('FND-004');
  assert.equal(fnd4?.status, 'passed', 'FND-004 acceptance must remain passed');
  assert.equal(fnd4?.test_result_status, 'PASS');
  assert.equal(fnd4?.independent_review_status, 'PASS');
});
const historicalUnits = new Set(['FND-001', 'FND-002', 'FND-003', 'FND-004', 'FND-006']);
const testIds = unit => unit.test_obligations.map(test => test.id);
const foundationIds = (id, n) => Array.from({ length: n }, (_, i) => id + '-T' + String(i + 1).padStart(2, '0'));
const text = value => typeof value === 'string' && value.trim().length > 0;

function checkCompletion(unit) {
  for (const field of ['test_result_status', 'independent_review_status', 'retest_status']) {
    assert.equal(unit[field], 'PASS', field + ' must be PASS');
  }
  sameIds(unit.completed_test_ids, testIds(unit), 'completion requires exactly the catalog tests');
  assert.deepEqual(unit.open_review_items, [], 'open findings prevent completion');
  assert(Array.isArray(unit.closed_review_items) && (unit.required_review_item_ids ?? []).every(id => unit.closed_review_items.includes(id)), 'missing required review closure');
  assert(text(unit.completed_at) && Number.isFinite(Date.parse(unit.completed_at)), 'completion needs a valid timestamp');
  evidenceFiles(unit.evidence_paths);
}

// This legacy acceptance binds a Git tree, whereas new acceptances bind a commit.
check('historical FND-006', () => {
  const unit = units.get('FND-006');
  assert.equal(unit?.status, 'passed', 'FND-006 acceptance must remain passed');
  sameIds(testIds(unit), foundationIds(unit.id, 8), 'FND-006 requires exactly T01-T08');
  assert.deepEqual(unit.depends_on, ['FND-004']);
  checkCompletion(unit);
  const proof = record(unit.acceptance_record);
  assert.equal(proof.candidate_sha_type, 'git_tree');
  assert.equal(proof.candidate_sha, '80738ce0b1705dfc15a80ac9852d76a170d7ede1', 'historical tree changed');
  assert.equal(proof.candidate_commit, '5e3cc68b7182146b45ae38d8059202b23fe23d83');
  assert.equal(unit.candidate_commit, proof.candidate_commit);
  sameIds(proof.passed_test_ids, testIds(unit), 'historical candidate must cover all eight tests');
  assert.equal(proof.independent_status, 'PASS');
  const jobs = record(proof.jobs_record), regress = record(proof.regression_record), supplement = record(proof.supplement_record);
  for (const run of [jobs, regress, supplement]) {
    assert.equal(run.status, 'PASS', 'failed run cannot certify candidate');
    assert.equal(run.exit, 0, 'nonzero exit cannot certify candidate');
  }
  for (const tree of [jobs.before.tree, jobs.after.tree, regress.expected, supplement.tree]) assert.equal(tree, proof.candidate_sha, 'independent runs must match frozen tree');
  assert.deepEqual(jobs.results.map(r => r.id), ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'V6']);
  assert(jobs.results.every(r => r.exit === 0) && regress.stable === true && regress.load_verified === true && supplement.stable === true, 'all candidate checks and actual Host binding required');
});

check('current unit execution state', () => {
  const unit = units.get(execution.active_unit);
  assert(unit, 'active unit not found');
  const states = new Map([['ready', 'planned'], ['in_progress', 'in_progress'], ['blocked', 'blocked'], ['passed', 'passed'], ['failed', 'failed']]);
  assert(states.has(execution.unit_state), 'invalid execution unit_state');
  assert.equal(unit.status, states.get(execution.unit_state), 'execution state and unit outcome disagree');
  assert(catalog.units.every(u => u.status !== 'in_progress' || u.id === unit.id), 'another feature is being developed');
  for (const field of ['test_result_status', 'independent_review_status', 'retest_status']) {
    if (field in unit) assert(caseStates.has(unit[field]), 'invalid current ' + field);
  }
  if ('completed_test_ids' in unit) {
    const ids = unit.completed_test_ids;
    assert(Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => testIds(unit).includes(id)), 'invalid current completed_test_ids');
  }
});

function bindCandidate(run, unit) {
  assert.equal(run.unit_id, unit.id, 'candidate unit mismatch');
  assert.equal(run.candidate_sha, unit.candidate_commit, 'candidate commit mismatch');
}

function checkRealProvider(unit, proof) {
  assert.equal(unit.real_provider_status, 'PASS', 'real provider acceptance required');
  assert.equal(unit.real_provider_evidence, proof.real_provider_record, 'provider evidence reference mismatch');
  const run = record(proof.real_provider_record);
  bindCandidate(run, unit);
  assert.equal(run.category, 'REAL_DEEPSEEK_UI_HTTP_SQLITE');
  assert.equal(run.status, 'PASS');
  assert.equal(run.independent, true, 'independent provider run required');
  if ('product_commit' in run) assert.equal(run.product_commit, unit.candidate_commit, 'provider product commit mismatch');
  assert.equal(run.provider, 'api', 'unexpected provider route');
  assert.equal(run.model, 'deepseek-v4.1-flash-1017/hs14', 'unexpected DeepSeek model route');
  assert.equal(run.upstream, lock.upstream.commit, 'provider Host differs from lock');
  assert.match(run.plugin_sha256, /^[0-9a-f]{64}$/, 'frozen plugin hash missing');
  assert.equal(run.loaded_plugin_sha256, run.plugin_sha256, 'loaded Host plugin differs from frozen build');
  assert.equal(run.prepare_requests, 2, 'expected two prepares');
  assert.equal(run.successful_model_selections, 2, 'expected two successful model selections');
  assert.equal(run.price_basis?.conservative_reservation_not_actual_invoice, true, 'pricing estimate must not be represented as an invoice');
  assert.deepEqual(run.operations.map(op => op.tool), ['knowledgeos_read_object', 'knowledgeos_update_object'], 'expected one read followed by one update');
  const [first, second] = run.operations;
  assert(text(first.object_id) && second.object_id === first.object_id, 'provider object mismatch');
  for (const [i, op] of run.operations.entries()) {
    assert.equal(op.revision, i + 1, 'unexpected object revision');
    assert.equal(op.receipts, i, 'unexpected mutation receipts');
    assert.equal(op.authenticated_http_status, 200, 'authenticated HTTP reread missing');
    assert.equal(op.http_revision, op.revision, 'HTTP revision differs from SQLite');
    assert.match(op.body_sha256, /^[0-9a-f]{64}$/);
    assert.equal(op.http_body_sha256, op.body_sha256, 'HTTP content differs from SQLite');
    assert.equal(op.ui_reread_and_sql_agree, true, 'UI reread differs from SQLite');
  }
  assert.notEqual(first.body_sha256, second.body_sha256, 'update did not change content');
  assert(!(unit.blocked_test_ids ?? []).length, 'passed unit still has blocked tests');
}

for (const unit of catalog.units.filter(u => u.status === 'passed' && !historicalUnits.has(u.id))) check(unit.id + ' candidate', () => {
  checkCompletion(unit);
  assert.match(unit.candidate_commit, /^[a-f0-9]{40}$/, 'frozen candidate commit required');
  const proof = record(unit.acceptance_record);
  bindCandidate(proof, unit);
  sameIds(proof.passed_test_ids, testIds(unit), 'acceptance must cover every catalog test');
  assert.equal(proof.independent_status, 'PASS');
  assert.notEqual(realpathSync(resolve(root, evidenceFile(unit.acceptance_record))), realpathSync(resolve(root, evidenceFile(proof.independent_record))), 'independent record must be separate from acceptance');
  const run = record(proof.independent_record);
  bindCandidate(run, unit);
  assert.equal(run.status, 'PASS', 'independent run failed');
  assert.equal(run.exit, 0, 'independent run exit must be zero');
  assert(text(run.command), 'independent command missing');
  sameIds(run.results.map(r => r.id), testIds(unit), 'independent result coverage mismatch');
  assert(run.results.every(r => r.status === 'PASS'), 'independent test failed');
  if (unit.id === 'FND-005') {
    sameIds(testIds(unit), foundationIds(unit.id, 9), 'FND-005 requires exactly T01-T09');
    checkRealProvider(unit, proof);
  }
});

for (const item of cases.values()) if (item.status === 'PASS') check(item.id + ' final case proof', () => {
  const owner = units.get(finalOwners.get(item.id)[0]);
  assert.equal(owner?.status, 'passed', 'final owner has not passed');
  evidenceFiles(item.evidence_paths);
  assert(item.evidence_paths.filter(p => extname(p) === '.json').map(record).some(run =>
    run.case_id === item.id && run.unit_id === owner.id && run.candidate_sha === owner.candidate_commit &&
    /^[a-f0-9]{40}$/.test(run.candidate_sha) && run.status === 'PASS' && run.exit === 0 && text(run.command)),
  'missing case execution proof for final owner and candidate');
});

check('final product completion', () => {
  if (units.get('CHECK-004')?.status === 'passed') {
    assert(catalog.units.every(u => u.status === 'passed'), 'CHECK-004 requires every other unit passed');
    assert(matrix.acceptance_cases.every(c => c.status === 'PASS'), 'CHECK-004 requires every complete case PASS');
  }
});

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', '.cache', 'node_modules', '.worktrees'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
let markdownFiles = 0;
for (const path of walk(root).filter((path) => extname(path) === '.md')) {
  markdownFiles++;
  const content = readFileSync(path, 'utf8');
  check(path, () => {
    assert(content.endsWith('\n') && !content.endsWith('\n\n'), 'expected exactly one trailing newline');
    assert.equal((content.match(/^```/gm) ?? []).length % 2, 0, 'unbalanced fenced code');
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^[a-z]+:/i.test(destination)) continue;
      assert(existsSync(resolve(dirname(path), decodeURIComponent(destination))), `broken local link: ${destination}`);
    }
  });
}
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ status: 'PASS', scope: 'plan_structure_traceability_and_execution_consistency_only', requirements: requirementIds.size, acceptanceCases: caseIds.size, workUnits: units.size, plannedUnitChecks: unitTestIds.size, executor: execution.executor, activeUnit: execution.active_unit, autoAdvance: execution.auto_advance, fullProductReview: execution.codex_review.state, markdownFiles, upstreamCommit: lock.upstream.commit, implementationVerifiedByThisCheck: false, productTestsExecuted: 0 }, null, 2)}\n`);
