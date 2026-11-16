#!/usr/bin/env node
/** Exercise plan gates in temporary copies; never mark product tests as executed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const temporary = mkdtempSync(join(tmpdir(), 'knowledgeos-plan-gates-'));
const outcomes = [];
const json = (repo, path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const save = (repo, path, value) => writeFileSync(join(repo, path), JSON.stringify(value, null, 2) + '\n');
const statePath = 'config/execution_state.json';
const catalogPath = 'config/work_units.json';
const editState = (repo, change) => { const value = json(repo, statePath); change(value); save(repo, statePath, value); };
const editCatalog = (repo, change) => { const value = json(repo, catalogPath); change(value); save(repo, catalogPath, value); };
const editPromptAndHash = (repo, change) => {
  const path = json(repo, statePath).active_instruction.path;
  const value = change(readFileSync(join(repo, path), 'utf8'));
  writeFileSync(join(repo, path), value);
  editState(repo, (s) => { s.active_instruction.sha256 = createHash('sha256').update(value).digest('hex'); });
};
// This is a synthetic structure fixture, not evidence of real product completion.
const completedFixture = (repo) => {
  const evidence = 'docs/evidence/FND-002/synthetic-gate-fixture.json';
  save(repo, evidence, { synthetic: true, purpose: 'plan gate only; no product test' });
  editCatalog(repo, (c) => Object.assign(c.units.find((u) => u.id === 'FND-002'), {
    status: 'passed', test_result_status: 'PASS', retest_status: 'PASS',
    open_review_items: [], closed_review_items: ['R1', 'R2'],
    completed_at: new Date().toISOString(), evidence_paths: [evidence],
  }));
  editState(repo, (s) => { s.unit_state = 'awaiting_user'; });
};

const cases = [
  ['current valid plan', 0, () => {}, null],
  ['prompt hash drift', 1, (repo) => writeFileSync(join(repo, 'CODEX_START.md'), readFileSync(join(repo, 'CODEX_START.md'), 'utf8') + '\nchanged\n'), 'active prompt content changed'],
  ['retired DSH prompt restored', 1, (repo) => writeFileSync(join(repo, 'DSH_START.md'), '# Retired fixture\n'), 'only one root executable prompt'],
  ['DSH executor coherently restored', 1, (repo) => {
    editState(repo, (s) => { s.executor = 'deepseek_harness'; });
    editCatalog(repo, (c) => { c.current_executor = 'deepseek_harness'; });
    editPromptAndHash(repo, (s) => s.replace('executor: "codex"', 'executor: "deepseek_harness"'));
  }, 'current takeover executor must be Codex'],
  ['catalog executor mismatch', 1, (repo) => editCatalog(repo, (c) => { c.current_executor = 'deepseek_harness'; }), 'work catalog scope'],
  ['catalog stale prompt path', 1, (repo) => editCatalog(repo, (c) => { c.only_active_prompt = 'DSH_START.md'; }), 'work catalog scope'],
  ['automatic advance enabled', 1, (repo) => editState(repo, (s) => { s.auto_advance = true; }), 'automatic advance contradicts'],
  ['parallel features permitted', 1, (repo) => editCatalog(repo, (c) => { c.rules.allow_parallel_feature_implementation = true; }), 'work catalog scope'],
  ['second running feature', 1, (repo) => editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-003').status = 'in_progress'; }), 'another feature is being developed'],
  ['unapproved future activation after synthetic closure', 1, (repo) => {
    completedFixture(repo);
    editState(repo, (s) => { s.active_unit = 'FND-003'; s.unit_state = 'ready'; });
    editCatalog(repo, (c) => {
      const u = c.units.find((u) => u.id === 'FND-003');
      Object.assign(u, { instruction_revision: '3.0.0', working_branch: json(repo, statePath).working_branch, takeover_base_commit: json(repo, statePath).takeover.base_commit });
    });
    editPromptAndHash(repo, (s) => s.replace('active_unit: "FND-002"', 'active_unit: "FND-003"'));
  }, 'takeover repair does not authorize the next feature'],
  ['completion while finding remains open', 1, (repo) => {
    completedFixture(repo);
    editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-002').open_review_items = ['R1']; });
  }, 'open findings prevent completion'],
  ['completion without candidate retest', 1, (repo) => {
    completedFixture(repo);
    editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-002').retest_status = 'NOT_RUN'; });
  }, 'new-candidate retests must pass'],
  ['full product review falsely activated', 1, (repo) => editState(repo, (s) => { s.codex_review.state = 'active'; }), 'current repair is not the full product review'],
  ['complete acceptance falsely passed', 1, (repo) => {
    const matrix = json(repo, 'config/requirements_matrix.json');
    matrix.acceptance_cases[0].status = 'PASS';
    matrix.acceptance_cases[0].evidence_paths = ['docs/evidence/FND-002/REPORT.md'];
    save(repo, 'config/requirements_matrix.json', matrix);
  }, 'foundation repair must not certify complete product acceptance cases'],
  ['synthetic valid completed structure', 0, completedFixture, null],
];

try {
  for (let index = 0; index < cases.length; index++) {
    const [name, expected, change, reason] = cases[index];
    const repo = join(temporary, String(index));
    cpSync(root, repo, { recursive: true, filter: (path) => !['.git', '.cache', 'node_modules', '.worktrees'].includes(basename(path)) });
    change(repo);
    const result = spawnSync(process.execPath, [join(repo, 'scripts/verify-plan.mjs')], { cwd: repo, encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(result.status, expected, `${name}: ${result.stderr || result.stdout}`);
    if (reason) assert(result.stderr.includes(reason), `${name}: rejected for unexpected reason: ${result.stderr}`);
    outcomes.push({ name, status: 'PASS', expectedExitCode: expected, actualExitCode: result.status });
    rmSync(repo, { recursive: true, force: true });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify({
  status: 'PASS', scope: 'plan_gate_regressions_only', started_at: startedAt,
  finished_at: new Date().toISOString(), checks: outcomes.length, results: outcomes,
  realProjectStatesModified: false, implementationVerifiedByThisCheck: false, productTestsExecuted: 0,
}, null, 2) + '\n');
