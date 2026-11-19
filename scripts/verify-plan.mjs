#!/usr/bin/env node
/** Check the executable plan's references and traceability, not product behavior. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const matrix = JSON.parse(read('config/requirements_matrix.json'));
const lock = JSON.parse(read('config/upstream.lock.json'));
const releases = JSON.parse(read('releases/index.json'));
const execution = JSON.parse(read('config/execution_state.json'));
const catalog = JSON.parse(read('config/work_units.json'));
const activePrompt = read(execution.active_instruction.path);
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
    assert(item.evidence_paths?.length, 'verified needs evidence');
    assert(item.acceptance_ids.every((id) => cases.get(id)?.status === 'PASS'), 'verified requires every linked case PASS');
  }
});
for (const item of matrix.acceptance_cases) check(item.id, () => {
  assert(phases.has(item.final_milestone), 'final milestone is required');
  assert(caseStates.has(item.status), 'invalid acceptance status');
  for (const field of ['preconditions', 'steps', 'expected', 'level', 'evidence_required']) assert(item[field], `missing ${field}`);
  for (const id of item.requirement_ids) assert(requirements.get(id)?.acceptance_ids.includes(item.id), `missing reciprocal requirement ${id}`);
  if (item.status === 'PASS') assert(item.evidence_paths?.length, 'PASS needs real execution evidence paths');
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
const activeUnit = execution.active_unit;
const currentTestIds = Array.from({ length: 8 }, (_, index) => `FND-006-T${String(index + 1).padStart(2, '0')}`);
const currentReviewItemIds = [];
check('single current instruction', () => {
  assert.equal(execution.executor, 'codex', 'current foundation executor must be Codex');
  assert.equal(execution.execution_phase, 'codex_foundation', 'the completed takeover phase is no longer active');
  assert.equal(execution.active_unit, 'FND-006', 'current authorization must be FND-006');
  assert.equal(execution.execution_mode, 'single_feature_gated');
  assert.equal(execution.max_active_units, 1);
  assert.equal(execution.max_product_code_writers, 1);
  assert.equal(execution.auto_advance, false, 'automatic advance contradicts staged execution');
  assert.equal(execution.active_instruction.path, 'CODEX_START.md');
  assert.equal(execution.active_instruction.sha256, createHash('sha256').update(activePrompt).digest('hex'), 'active prompt content changed without its state hash');
  for (const [key, value] of Object.entries({ instruction_revision: execution.instruction_revision, execution_phase: execution.execution_phase, executor: execution.executor, active_unit: execution.active_unit })) {
    assert(activePrompt.includes(`${key}: "${value}"`), `prompt metadata disagrees: ${key}`);
  }
  assert(activePrompt.includes('auto_advance: false'));
  const roots = readdirSync(root).filter((name) => /(?:START|PROMPT).*\.md$/i.test(name));
  assert.deepEqual(roots, ['CODEX_START.md'], 'only one root executable prompt is permitted');
  assert.deepEqual(execution.retired_instruction_paths, ['DSH_START.md']);
  for (const path of execution.retired_instruction_paths) assert(!existsSync(resolve(root, path)), `retired prompt still exists: ${path}`);
  assert.equal(execution.takeover.authorization, 'explicit_user_request');
  assert.equal(execution.takeover.product_host, 'deepseek_harness', 'changing the developer does not remove the product host');
  assert.equal(execution.takeover.state, 'completed_historical_phase');
  assert.equal(execution.codex_review.scope, 'full_product_review');
  assert.equal(execution.codex_review.state, 'not_started', 'current feature is not the full product review');
  assert.equal(execution.codex_review.active_prompt, null);
});
check('work catalog scope', () => {
  assert.equal(catalog.mode, 'single_feature_gated');
  assert.equal(catalog.current_executor, execution.executor);
  assert.equal(catalog.only_active_prompt, execution.active_instruction.path);
  assert.equal(catalog.active_unit_source, 'config/execution_state.json');
  assert.equal(catalog.rules.max_active_units, execution.max_active_units);
  assert.equal(catalog.rules.max_implementation_writers, execution.max_product_code_writers);
  assert.equal(catalog.rules.allow_cross_unit_auto_advance, false);
  assert.equal(catalog.rules.allow_parallel_feature_implementation, false);
  assert.equal(catalog.rules.test_during_each_unit, true);
  assert.equal(catalog.rules.codex_role, 'active_feature_development_and_test_then_wait_for_user_selection');
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
  for (const id of item.depends_on) assert(units.has(id) && id !== item.id, `invalid dependency ${id}`);
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
  if (item.status === 'passed') assert(item.evidence_paths?.length, 'passed unit requires evidence_paths');
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
  assert.match(execution.base_commit, /^[a-f0-9]{40}$/);
  assert.match(execution.base_commit, /^[a-f0-9]{40}$/, 'current feature base commit is missing');
  assert(activePrompt.includes(execution.base_commit), 'current base commit is missing from the active instruction');
  const fnd3 = units.get('FND-003');
  assert.equal(fnd3?.status, 'passed', 'FND-003 acceptance must remain passed');
  assert.equal(fnd3?.test_result_status, 'PASS', 'FND-003 accepted tests must remain PASS');
  assert.equal(fnd3?.independent_review_status, 'PASS', 'FND-003 independent review must remain PASS');
  const fnd4 = units.get('FND-004');
  assert.equal(fnd4?.status, 'passed', 'FND-004 acceptance must remain passed');
  assert.equal(fnd4?.test_result_status, 'PASS');
  assert.equal(fnd4?.independent_review_status, 'PASS');
});
check('current unit execution state', () => {
  const unit = units.get(execution.active_unit);
  assert(unit, 'active unit not found');
  assert.equal(unit.instruction_revision, execution.instruction_revision);
  assert.equal(unit.working_branch, execution.working_branch);
  assert.equal(unit.base_commit, execution.base_commit, 'current unit and execution base_commit disagree');
  assert.deepEqual(unit.test_obligations.map((test) => test.id).sort(), currentTestIds, 'FND-006 requires exactly T01-T08');
  assert.deepEqual(unit.depends_on, ['FND-004']);
  assert.equal(units.get('FND-005').status, 'blocked', 'FND-005 remains blocked');
  assert(['ready', 'in_progress', 'blocked', 'awaiting_user'].includes(execution.unit_state));
  const running = catalog.units.filter((item) => item.status === 'in_progress');
  assert(running.length <= 1 && running.every((item) => item.id === unit.id), 'another feature is being developed');
  for (const dependency of unit.depends_on) assert.equal(units.get(dependency)?.status, 'passed', `active dependency not passed: ${dependency}`);
  const requiredStatus = { ready: 'planned', in_progress: 'in_progress', blocked: 'blocked', awaiting_user: 'passed' }[execution.unit_state];
  assert.equal(unit.status, requiredStatus, 'execution state and unit outcome disagree');
  for (const item of catalog.units) {
    if (!['FND-001', 'FND-002', 'FND-003', 'FND-004', 'FND-005', 'FND-006'].includes(item.id)) assert.equal(item.status, 'planned', `future unit changed before authorization: ${item.id}`);
  }
  assert(matrix.acceptance_cases.every((item) => item.status === 'NOT_RUN'), 'foundation slice must not certify complete product acceptance cases');
  assert(matrix.requirements.every((item) => item.implementation_status !== 'verified'), 'foundation slice must not certify complete requirements');
  assert(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'].includes(unit.test_result_status), 'invalid current test result');
  assert(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'].includes(unit.independent_review_status), 'invalid independent review result');
  assert(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'].includes(unit.retest_status), 'invalid current repair retest result');
  assert(Array.isArray(unit.completed_test_ids) && new Set(unit.completed_test_ids).size === unit.completed_test_ids.length && unit.completed_test_ids.every((id) => currentTestIds.includes(id)), 'completed test ids must be a unique current-unit subset');
  if (unit.status === 'passed') {
    const proof = JSON.parse(read(unit.acceptance_record));
    assert.match(proof.candidate_sha, /^[a-f0-9]{40}$/);
    assert.deepEqual(proof.passed_test_ids, currentTestIds, 'candidate must cover all eight checks');
    assert.equal(proof.independent_status, 'PASS', 'candidate lacks independent evidence');
    assert.equal(unit.test_result_status, 'PASS', 'passed unit still has failed or missing test results');
    assert.equal(unit.independent_review_status, 'PASS', 'independent review must pass before completion');
    assert.equal(unit.retest_status, 'PASS', 'repair candidate retests must pass before completion');
    assert.deepEqual([...unit.completed_test_ids].sort(), currentTestIds, 'completion requires all current test ids');
    assert.deepEqual(unit.open_review_items, [], 'open findings prevent completion');
    assert(Array.isArray(unit.closed_review_items) && currentReviewItemIds.every((id) => unit.closed_review_items.includes(id)), 'completion requires closure of required review items');
    assert(unit.completed_at && Number.isFinite(Date.parse(unit.completed_at)), 'completion needs an actual valid timestamp');
    assert(unit.evidence_paths?.length && unit.evidence_paths.every((path) => existsSync(resolve(root, path))), 'completion evidence path is missing');
  }
  for (const test of unit.test_obligations) {
    const shortId = test.id.slice(unit.id.length + 1);
    assert(activePrompt.includes(`| ${shortId} |`) || activePrompt.includes(test.id), `current prompt omits local test ${test.id}`);
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
