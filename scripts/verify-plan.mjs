#!/usr/bin/env node
/** Check the executable plan's references and traceability, not product behavior. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const matrix = JSON.parse(read('config/requirements_matrix.json'));
const lock = JSON.parse(read('config/upstream.lock.json'));
const releases = JSON.parse(read('releases/index.json'));
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
  assert(read('CODEX_START.md').includes(lock.upstream.commit), 'Codex instruction and lock disagree');
});
check('release claims', () => {
  if (releases.status === 'NOT_BUILT') assert.equal(releases.releases.length, 0, 'unbuilt releases must not advertise assets');
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
process.stdout.write(`${JSON.stringify({ status: 'PASS', scope: 'plan_structure_and_traceability_only', requirements: requirementIds.size, acceptanceCases: caseIds.size, markdownFiles, upstreamCommit: lock.upstream.commit, implementationVerifiedByThisCheck: false, productTestsExecuted: 0 }, null, 2)}\n`);
