#!/usr/bin/env node
// Selection never edits outcomes, promotes evidence, or runs a product test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, openSync, closeSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(root, 'config/execution_state.json');
const read = path => JSON.parse(readFileSync(path, 'utf8'));

export function readyQueue(units) {
  const byId = new Map(units.map(unit => [unit.id, unit]));
  return units.filter(unit => unit.status === 'planned' &&
    (unit.id !== 'CHECK-004' || units.every(u => u === unit || u.status === 'passed')) &&
    unit.depends_on.every(id => byId.get(id)?.status === 'passed')).map(unit => unit.id);
}

export function selectAfterCheckpoint(state, units) {
  assert.equal(state.auto_advance, true);
  assert(['passed', 'blocked'].includes(state.unit_state), 'repair/finish the active unit first');
  const cp = state.checkpoint;
  assert.equal(cp?.unit_id, state.active_unit, 'a checkpoint for the departing unit is required');
  assert.equal(units.find(u => u.id === cp.unit_id)?.status, state.unit_state, 'catalog outcome disagrees');
  assert.match(cp.base_commit, /^[0-9a-f]{40}$/);
  assert.match(cp.candidate_sha, /^[0-9a-f]{40}$/);
  const result = {passed: 'PASS', blocked: 'BLOCKED'}[state.unit_state];
  assert.equal(cp.test_results?.unit_acceptance, result);
  assert(cp.completed?.length && Array.isArray(cp.defects) && Array.isArray(cp.blocked_dependencies));
  if (result === 'BLOCKED') assert(cp.defects.length || cp.blocked_dependencies.length, 'missing blocker');
  const target = units.find(u => u.id === cp.next_task);
  const retry = target?.status === 'blocked' && target.id !== cp.unit_id &&
    typeof cp.retry_basis === 'string' && cp.retry_basis.trim() && cp.retry_evidence &&
    target.depends_on.every(id => units.find(u => u.id === id)?.status === 'passed');
  assert(retry || readyQueue(units).includes(cp.next_task), 'checkpoint must name a dependency-ready planned unit or documented retry');
  return {...state, active_unit: cp.next_task, unit_state: retry ? 'blocked' : 'ready', state_reason: retry ? cp.retry_basis : `Selected after ${cp.unit_id}: ${result}`};
}

function checkEvidence(path) {
  assert(typeof path === 'string' && /^docs\/evidence\/[\w./-]+$/.test(path) && !path.includes('..'), 'invalid checkpoint evidence path');
  const file = realpathSync(join(root,path));
  const rel = relative(realpathSync(join(root,'docs/evidence')), file);
  assert(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep) && statSync(file).isFile(), 'checkpoint evidence must be a local file');
}

function main(args) {
  assert(args.length === 0 || (args.length === 1 && args[0] === '--advance'), 'usage: unit-queue.mjs [--advance]');
  const lock = `${statePath}.lock`;
  let fd;
  try {
    if (args.length) fd = openSync(lock, 'wx');
    execFileSync(process.execPath, [join(root, 'scripts/verify-plan.mjs')], {cwd: root, stdio: ['ignore', 'ignore', 'inherit']});
    const state = read(statePath), {units} = read(join(root, 'config/work_units.json'));
    if (!args.length) {
      console.log(JSON.stringify({active: state.active_unit, state: state.unit_state, ready: readyQueue(units), blocked: units.filter(u => u.status === 'blocked').map(u => u.id)}, null, 2));
      return;
    }
    const next = selectAfterCheckpoint(state, units);
    checkEvidence(state.checkpoint.evidence);
    if (next.unit_state === 'blocked') checkEvidence(state.checkpoint.retry_evidence);
    const tmp = `${statePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', {flag: 'wx'});
    try { renameSync(tmp, statePath); } finally { if (existsSync(tmp)) unlinkSync(tmp); }
    console.log(`Selected ${next.active_unit}; no unit outcome changed.`);
  } finally {
    if (fd !== undefined) { closeSync(fd); unlinkSync(lock); }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
