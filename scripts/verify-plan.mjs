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
check('single current instruction', () => {
  assert.equal(execution.executor, 'deepseek_harness', 'current executor must remain DeepSeek Harness');
  assert.equal(execution.execution_phase, 'deepseek_foundation');
  assert.equal(execution.execution_mode, 'single_feature_gated');
  assert.equal(execution.max_active_units, 1);
  assert.equal(execution.max_product_code_writers, 1);
  assert.equal(execution.auto_advance, false, 'automatic advance contradicts staged execution');
  assert.equal(execution.active_instruction.path, 'DSH_START.md');
  assert.equal(execution.active_instruction.sha256, createHash('sha256').update(activePrompt).digest('hex'), 'active prompt content changed without its state hash');
  for (const [key, value] of Object.entries({ instruction_revision: execution.instruction_revision, execution_phase: execution.execution_phase, executor: execution.executor, active_unit: execution.active_unit })) {
    assert(activePrompt.includes(`${key}: "${value}"`), `prompt metadata disagrees: ${key}`);
  }
  assert(activePrompt.includes('auto_advance: false'));
  const roots = readdirSync(root).filter((name) => /(?:START|PROMPT).*\.md$/i.test(name));
  assert.deepEqual(roots, ['DSH_START.md'], 'only one root executable prompt is permitted');
  for (const path of execution.retired_instruction_paths) assert(!existsSync(resolve(root, path)), `retired prompt still exists: ${path}`);
  assert.equal(execution.codex_review.state, 'locked');
  assert.equal(execution.codex_review.active_prompt, null);
});
check('work catalog scope', () => {
  assert.equal(catalog.mode, 'single_feature_gated');
  assert.equal(catalog.current_executor, execution.executor);
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
check('current unit execution state', () => {
  const unit = units.get(execution.active_unit);
  assert(unit, 'active unit not found');
  assert(['ready', 'in_progress', 'blocked', 'awaiting_user'].includes(execution.unit_state));
  const running = catalog.units.filter((item) => item.status === 'in_progress');
  assert(running.length <= 1 && running.every((item) => item.id === unit.id), 'another feature is being developed');
  for (const dependency of unit.depends_on) assert.equal(units.get(dependency)?.status, 'passed', `active dependency not passed: ${dependency}`);
  const requiredStatus = { ready: 'planned', in_progress: 'in_progress', blocked: 'blocked', awaiting_user: 'passed' }[execution.unit_state];
  assert.equal(unit.status, requiredStatus, 'execution state and unit outcome disagree');
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
process.stdout.write(`${JSON.stringify({ status: 'PASS', scope: 'plan_structure_traceability_and_execution_consistency_only', requirements: requirementIds.size, acceptanceCases: caseIds.size, workUnits: units.size, plannedUnitChecks: unitTestIds.size, executor: execution.executor, activeUnit: execution.active_unit, autoAdvance: execution.auto_advance, codexReview: execution.codex_review.state, markdownFiles, upstreamCommit: lock.upstream.commit, implementationVerifiedByThisCheck: false, productTestsExecuted: 0 }, null, 2)}\n`);
