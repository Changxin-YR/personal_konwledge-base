#!/usr/bin/env node
/** Exercise plan gates in temporary copies; never mark product tests as executed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const temporary = mkdtempSync(join(tmpdir(), 'knowledgeos-plan-gates-'));
const outcomes = [];
const json = (repo, path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const save = (repo, path, value) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), JSON.stringify(value, null, 2) + '\n');
};
const statePath = 'config/execution_state.json';
const catalogPath = 'config/work_units.json';
const currentUnit = 'FND-005';
const currentTestIds = Array.from({ length: 9 }, (_, index) => `${currentUnit}-T${String(index + 1).padStart(2, '0')}`);
const currentReviewItemIds = [];
const editState = (repo, change) => { const value = json(repo, statePath); change(value); save(repo, statePath, value); };
const editCatalog = (repo, change) => { const value = json(repo, catalogPath); change(value); save(repo, catalogPath, value); };
const editUnit = (repo, change) => editCatalog(repo, (catalog) => change(catalog.units.find((unit) => unit.id === currentUnit)));
const editPromptAndHash = (repo, change) => {
  const path = json(repo, statePath).active_instruction.path;
  const value = change(readFileSync(join(repo, path), 'utf8'));
  writeFileSync(join(repo, path), value);
  editState(repo, (s) => { s.active_instruction.sha256 = createHash('sha256').update(value).digest('hex'); });
};
// This is a synthetic structure fixture, not evidence of real product completion.
const completedFixture = (repo) => {
  const evidence = 'docs/evidence/FND-005/synthetic-gate-fixture.json';
  save(repo, evidence, { category:'REAL_GPT_PROVIDER',status:'PASS',is_gpt:true,candidate_id:'TEMPORARY_SCHEMA_FIXTURE_ONLY',provider:'schema-fixture',model:'schema-fixture',operations:['knowledgeos_read_object','knowledgeos_update_object'].map(tool=>({tool,status:'PASS',real_provider_call:true,ui_verified:true,sql_verified:true,evidence_path:evidence})) });
  editUnit(repo, (unit) => Object.assign(unit, {
    status: 'passed', test_result_status: 'PASS', independent_review_status: 'PASS', retest_status: 'PASS',
    completed_test_ids: [...currentTestIds], open_review_items: [],
    required_review_item_ids: [...currentReviewItemIds], closed_review_items: [...currentReviewItemIds],
    completed_at: new Date().toISOString(), evidence_paths: [evidence], real_provider_status:'PASS', real_provider_evidence:evidence,
  }));
  editState(repo, (s) => { s.unit_state = 'awaiting_user'; });
};

const cases = [
  ['current valid plan', 0, () => {}, null],
  ['valid in-progress structure', 0, (repo) => {
    editState(repo, (s) => { s.unit_state = 'in_progress'; });
    editUnit(repo, (u) => { u.status = 'in_progress'; });
  }, null],
  ['valid blocked structure', 0, (repo) => {
    editState(repo, (s) => { s.unit_state = 'blocked'; });
    editUnit(repo, (u) => { u.status = 'blocked'; });
  }, null],
  ['prompt hash drift', 1, (repo) => writeFileSync(join(repo, 'CODEX_START.md'), readFileSync(join(repo, 'CODEX_START.md'), 'utf8') + '\nchanged\n'), 'active prompt content changed'],
  ['retired DSH prompt restored', 1, (repo) => writeFileSync(join(repo, 'DSH_START.md'), '# Retired fixture\n'), 'only one root executable prompt'],
  ['DSH executor coherently restored', 1, (repo) => {
    editState(repo, (s) => { s.executor = 'deepseek_harness'; });
    editCatalog(repo, (c) => { c.current_executor = 'deepseek_harness'; });
    editPromptAndHash(repo, (s) => s.replace('executor: "codex"', 'executor: "deepseek_harness"'));
  }, 'current foundation executor must be Codex'],
  ['completed takeover phase restored', 1, (repo) => {
    editState(repo, (s) => { s.execution_phase = 'codex_takeover_repair'; });
    editPromptAndHash(repo, (s) => s.replace('execution_phase: "codex_foundation"', 'execution_phase: "codex_takeover_repair"'));
  }, 'the completed takeover phase is no longer active'],
  ['catalog executor mismatch', 1, (repo) => editCatalog(repo, (c) => { c.current_executor = 'deepseek_harness'; }), 'work catalog scope'],
  ['catalog stale prompt path', 1, (repo) => editCatalog(repo, (c) => { c.only_active_prompt = 'DSH_START.md'; }), 'work catalog scope'],
  ['automatic advance enabled', 1, (repo) => editState(repo, (s) => { s.auto_advance = true; }), 'automatic advance contradicts'],
  ['parallel features permitted', 1, (repo) => editCatalog(repo, (c) => { c.rules.allow_parallel_feature_implementation = true; }), 'work catalog scope'],
  ['multiple product writers permitted', 1, (repo) => {
    editState(repo, (s) => { s.max_product_code_writers = 2; });
    editCatalog(repo, (c) => { c.rules.max_implementation_writers = 2; });
  }, 'single current instruction'],
  ['second running feature', 1, (repo) => editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-006').status = 'in_progress'; }), 'another feature is being developed'],
  ['unit state and outcome disagree', 1, (repo) => {
    editState(repo, (s) => { s.unit_state = 'awaiting_user'; });
    editUnit(repo, (u) => { u.status = 'planned'; });
  }, 'execution state and unit outcome disagree'],
  ['unit base differs from accepted base', 1, (repo) => editUnit(repo, (u) => { u.base_commit = '0'.repeat(40); }), 'current unit and execution base_commit disagree'],
  ['prerequisite no longer passed', 1, (repo) => editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-002').status = 'failed'; }), 'FND-002 acceptance must remain passed'],
  ['historical R1 reopened', 1, (repo) => editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-002').open_review_items = ['R1']; }), 'FND-002 still has open findings'],
  ['historical R2 closure removed', 1, (repo) => editCatalog(repo, (c) => { c.units.find((u) => u.id === 'FND-002').closed_review_items = ['R1']; }), 'FND-002 R1/R2 need historical closure'],
  ['test obligation removed', 1, (repo) => editUnit(repo, (u) => { u.test_obligations.pop(); }), 'FND-005 requires exactly T01-T09'],
  ['unapproved future activation after synthetic closure', 1, (repo) => {
    completedFixture(repo);
    editState(repo, (s) => { s.active_unit = 'FND-006'; s.unit_state = 'ready'; });
    editCatalog(repo, (c) => {
      const u = c.units.find((u) => u.id === 'FND-006');
      const state = json(repo, statePath);
      Object.assign(u, { instruction_revision: state.instruction_revision, working_branch: state.working_branch, base_commit: state.base_commit });
    });
    editPromptAndHash(repo, (s) => s.replace('active_unit: "FND-005"', 'active_unit: "FND-006"'));
  }, 'current authorization must be FND-005'],
  ['completion while finding remains open', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.open_review_items = ['IDENTITY-01']; });
  }, 'open findings prevent completion'],
  ['completion without product test pass', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.test_result_status = 'NOT_RUN'; });
  }, 'passed unit still has failed or missing test results'],
  ['completion without independent review', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.independent_review_status = 'NOT_RUN'; });
  }, 'independent review must pass before completion'],
  ['completion without repair candidate retest', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.retest_status = 'NOT_RUN'; });
  }, 'repair candidate retests must pass before completion'],
  ['completion with a missing test id', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.completed_test_ids.pop(); });
  }, 'completion requires all current test ids'],
  ['completion with a duplicate test id', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.completed_test_ids[8] = u.completed_test_ids[7]; });
  }, 'completed test ids must be a unique current-unit subset'],
  ['completion without valid timestamp', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.completed_at = 'invalid-time'; });
  }, 'completion needs an actual valid timestamp'],
  ['completion with missing evidence path', 1, (repo) => {
    completedFixture(repo);
    editUnit(repo, (u) => { u.evidence_paths = ['docs/evidence/FND-003/does-not-exist.json']; });
  }, 'completion evidence path is missing'],
  ['full product review falsely activated', 1, (repo) => editState(repo, (s) => { s.codex_review.state = 'active'; }), 'current feature is not the full product review'],
  ['complete acceptance falsely passed', 1, (repo) => {
    const matrix = json(repo, 'config/requirements_matrix.json');
    matrix.acceptance_cases[0].status = 'PASS';
    matrix.acceptance_cases[0].evidence_paths = ['docs/evidence/FND-002/REPORT.md'];
    save(repo, 'config/requirements_matrix.json', matrix);
  }, 'foundation slice must not certify complete product acceptance cases'],
  ['complete requirement falsely verified', 1, (repo) => {
    const matrix = json(repo, 'config/requirements_matrix.json');
    matrix.requirements.find((item) => item.id === 'F03').implementation_status = 'verified';
    matrix.requirements.find((item) => item.id === 'F03').evidence_paths = ['docs/evidence/FND-002/REPORT.md'];
    save(repo, 'config/requirements_matrix.json', matrix);
  }, 'foundation slice must not certify complete requirements'],
  ['fixture evidence cannot certify GPT',1,(repo)=>{completedFixture(repo);const p=json(repo,catalogPath).units.find(u=>u.id===currentUnit).real_provider_evidence;const e=json(repo,p);e.category='CONTROLLED_FIXTURE';save(repo,p,e)},'fixture or blocked provider evidence'],
  ['real call without UI proof cannot certify',1,(repo)=>{completedFixture(repo);const p=json(repo,catalogPath).units.find(u=>u.id===currentUnit).real_provider_evidence;const e=json(repo,p);e.operations[1].ui_verified=false;save(repo,p,e)},'real GPT read/write/UI/SQLite evidence is incomplete'],
  ['completion without real provider status',1,(repo)=>{completedFixture(repo);editUnit(repo,u=>{u.real_provider_status='BLOCKED'})},'completion requires real GPT provider evidence'],
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
