import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// Participation requirements are not unit scheduling dependencies.
export const integrationCases = new Map([
  ['P02', {units: ['LIB-002','READ-001','SEARCH-001','LIB-006'], checks: ['REAL_TEXTBOOK_INPUT','PARTIAL_USE','CANCEL_RESTART','WHOLE_RESULT_AND_RESOURCES']}],
  ['A04', {units: ['FND-004','LIB-001','READ-001','NOTE-001'], checks: ['INDEPENDENT_NOTE_AND_ORIGINAL','FIXED_VERSION_CITATION','PROJECT_LINK_AND_ACL','REMOVE_LINK_PRESERVES_SOURCE']}],
  ['A06', {units: ['LIB-002','READ-001','SEARCH-001','LIB-006'], checks: ['SAME_TEXTBOOK_AND_FIXED_RANGES','ORIGINAL_PAGE_CONTENT','SELECTED_AND_UNSELECTED_PAGES','RESOURCE_OBSERVATIONS']}],
  ['A09', {units: ['READ-001','READ-002','READ-003','SEARCH-001'], checks: ['CHINESE_QUERY_SET','FIXED_SOURCE_POSITION','POSITION_BOOKMARK_ANNOTATION_RESTART','VISIBLE_PARSED_ONLY']}],
  ['P03', {units: ['READ-002','KNOW-001','LEARN-003','LEARN-006'], checks: ['TERM_AND_QUESTION_SOURCE','FIRST_ANSWER_AND_ASSISTANCE','TWO_USERS_PERSONAL_RECORDS','RETURN_TO_READING']}],
  ['P08', {units: ['PROJECT-002','SCORE-001'], checks: ['PEER_PREVIEW_WAITS_FOR_ADMIN','NO_PREMATURE_COMPLETION_OR_SCORE','FINAL_SCORE_USES_ACTUAL_SUBMISSION_TIME']}],
  ['A16', {units: ['FEEDBACK-001','LIFE-001'], checks: ['ACTUAL_31_DAY_CLEANUP','NORMAL_RECORDS_REMAIN','DISTINCT_EVIDENCE_AND_INSUFFICIENT_DATA','ORIGIN_AND_VERSION_LINKS']}],
  ['A17', {units: ['FND-004','LIB-001','READ-001','NOTE-001','NOTE-002','NOTE-003'], checks: ['BIDIRECTIONAL_SHARED_TREE','PREVIEW_DELETE_AND_UNDO','CONFLICT_PRESERVES_DRAFT','LAYOUT_RESTART_AND_FIXED_SOURCE']}],
  ['A32', {units: ['PROJECT-003','PROJECT-004'], checks: [
    'original_ordinary_decision_and_real_contributor_appeal',
    'authorized_resolution_scope_and_transaction_rollback',
    'effective_correction_and_versioned_outbox_are_atomic_and_idempotent',
    'concurrent_open_and_resolution_revocation_and_restart',
  ]}],
  ['A34', {units: ['FND-004','LIB-001','READ-001','SEARCH-001','SHARE-001'], checks: ['SEVEN_DAY_CUTOFF_AND_STRADDLING_EDIT','EDIT_WITHOUT_MANAGEMENT','REVOKE_BLOCKS_READER_AND_SEARCH','GROUP_RENEWAL_AND_TRANSACTIONAL_RECEIPTS']}],
  ['A46', {units: ['FND-004','READ-001','READ-003','SEARCH-001','NOTE-001','AI-001','LIFE-004','EXPORT-001'], checks: ['SEARCH','DIRECT_URL','TOOL','SUMMARY','ANSWER','EXPORT','ORIGINAL_NOTE_WITHOUT_RESTRICTED_CITATION']}],
]);

const commitFormat = /^[a-f0-9]{40}$/;
const sha256Format = /^[a-f0-9]{64}$/;
const text = x => typeof x === 'string' && x.trim().length > 0;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function candidateFacts(root, commit) {
  assert.match(commit, commitFormat, 'invalid integration candidate SHA');
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root, stdio: ['ignore','pipe','pipe'], maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(git('rev-parse', commit + '^{commit}').toString().trim(), commit, 'candidate must be an actual commit');
  const requireAncestor = (earlier, later, message) => {
    assert.match(earlier, commitFormat);
    try { git('merge-base', '--is-ancestor', earlier, later); }
    catch (error) {
      if (error.status === 1) assert.fail(message);
      throw error;
    }
  };
  requireAncestor(commit, 'HEAD', 'integration candidate is not in branch history');
  const tree = git('rev-parse', commit + '^{tree}').toString().trim();
  const source_tree = git('rev-parse', commit + ':packages/knowledgeos-panel/src').toString().trim();
  const build = 'packages/knowledgeos-panel/lib/';
  const artifacts = ['index.js','client.js','pdf-extractor.js','pdfium.wasm','storage.js'];
  const digests = Object.fromEntries(artifacts.map(file => [file, sha256(git('show', commit+':'+build+file))]));
  return {
    tree, source_tree, entry_sha256: digests['index.js'], build_sha256: sha256(JSON.stringify(digests)),
    ancestor(accepted, unit) { requireAncestor(accepted, commit, `integration candidate excludes accepted ${unit}`); },
  };
}

export function assertIntegratedCase({root, item, owner, units, proof, record, hashFile}) {
  assert.equal(proof.schema, 'integrated-case-v1');
  assert.equal(proof.case_id,item.id);
  assert.equal(proof.unit_id,owner.id);
  const policy = integrationCases.get(item.id) ?? {units:[owner.id],checks:[item.id]};
  const candidate=proof.candidate_sha;
  const facts=candidateFacts(root,candidate);
  const fingerprint = ['tree','source_tree','entry_sha256','build_sha256'];
  for(const key of fingerprint)assert.equal(proof[key],facts[key],`integration ${key} mismatch`);

  assert(Array.isArray(proof.participants),'missing participants');
  const ids=proof.participants.map(p=>p.unit_id);
  assert.equal(new Set(ids).size,ids.length,'duplicate integration participant');
  for(const id of [owner.id,...policy.units])assert(ids.includes(id),`required participant missing: ${id}`);
  for(const p of proof.participants){
    const unit=units.get(p.unit_id);
    assert.equal(unit?.status,'passed',`participant not passed: ${p.unit_id}`);
    const accepted=unit.candidate_commit??unit.accepted_base_commit;
    assert.equal(p.candidate_sha,accepted,`changed historical participant candidate: ${p.unit_id}`);
    facts.ancestor(accepted, p.unit_id);
  }

  const kinds = ['main','independent','regression'];
  const paths = new Set();
  for(const kind of kinds){
    const ref=proof[kind];
    assert(ref&&text(ref.path),'requires separate execution records');
    assert.match(ref.sha256,sha256Format);
    assert.equal(hashFile(ref.path),ref.sha256,`${kind} evidence hash mismatch`);
    const path = realpathSync(resolve(root, ref.path));
    assert(!paths.has(path),'requires separate execution records');
    paths.add(path);
  }
  const runIds = new Set();
  const artifactSets = new Map();
  for(const kind of kinds){
    const ref=proof[kind];
    const run=record(ref.path);
    for(const key of ['case_id','unit_id','candidate_sha',...fingerprint])assert.equal(run[key],proof[key],`${kind} ${key} mismatch`);
    assert.deepEqual(run.participants,proof.participants,`${kind} participant binding mismatch`);
    assert.equal(run.kind,kind);
    assert.equal(run.status,'PASS',`${kind} not passed`);
    assert.equal(run.exit,0,`${kind} nonzero exit`);
    assert(text(run.command)&&text(run.environment)&&text(run.inputs)&&text(run.runner),`${kind} execution details required`);
    assert(text(run.run_id)&&!runIds.has(run.run_id),`${kind} requires a distinct run ID`);
    runIds.add(run.run_id);
    if(kind==='independent')assert.notEqual(run.runner,record(proof.main.path).runner,'independent runner equals main runner');
    assert(Array.isArray(run.results)&&run.results.length,`${kind} missing actual results`);
    const checks=run.results.map(r=>r.id);
    assert.equal(new Set(checks).size,checks.length,'duplicate assertion results');
    if(kind!=='regression')for(const id of policy.checks)assert(checks.includes(id),`${kind} missing assertion: ${id}`);
    assert(run.results.every(r=>text(r.id)&&r.status==='PASS'&&text(r.actual)),`${kind} missing successful observations`);
    assert(Array.isArray(run.artifacts)&&run.artifacts.length,`${kind} missing artifact records`);
    const artifacts = new Set();
    for(const a of run.artifacts){
      assert.match(a.sha256,sha256Format);
      assert.equal(hashFile(a.path),a.sha256,`${kind} artifact digest mismatch`);
      assert(!paths.has(realpathSync(resolve(root, a.path))),'execution records cannot serve as run artifacts');
      artifacts.add(a.sha256);
    }
    artifactSets.set(kind, artifacts);
  }
  for(const [kind, artifacts] of artifactSets){
    assert([...artifacts].some(digest => kinds.every(other => other === kind || !artifactSets.get(other).has(digest))),
      `${kind} requires at least one run-specific artifact`);
  }
}
