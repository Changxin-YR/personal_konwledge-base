import assert from 'node:assert/strict';
import test from 'node:test';
import {readyQueue, selectAfterCheckpoint} from './unit-queue.mjs';

const units = [
  {id:'base',status:'passed',depends_on:[]},
  {id:'model',status:'blocked',depends_on:['base']},
  {id:'library',status:'planned',depends_on:['base']},
  {id:'assistant',status:'planned',depends_on:['model']},
];
const checkpoint = {unit_id:'model',base_commit:'1'.repeat(40),candidate_sha:'2'.repeat(40),completed:['preflight'],test_results:{unit_acceptance:'BLOCKED'},defects:['route unavailable'],blocked_dependencies:[],next_task:'library'};
const state = {active_unit:'model',unit_state:'blocked',checkpoint,auto_advance:true};

test('unrelated work remains eligible; dependent, blocked, passed and running units do not', () => {
  assert.deepEqual(readyQueue([...units,{id:'running',status:'in_progress',depends_on:[]}]), ['library']);
  const before=structuredClone(units), next=selectAfterCheckpoint(state,units);
  assert.equal(next.active_unit,'library'); assert.equal(next.unit_state,'ready');
  assert.deepEqual(units,before); assert.equal(state.active_unit,'model');
});
test('no implicit completion, reassignment or fallback from an invalid checkpoint', () => {
  for(const change of [{next_task:'assistant'},{unit_id:'base'},{candidate_sha:null},{test_results:{unit_acceptance:'PASS'}},{defects:[]},{completed:[]}])
    assert.throws(()=>selectAfterCheckpoint({...state,checkpoint:{...checkpoint,...change}},units));
  for(const unit_state of ['ready','in_progress','failed','passed']) assert.throws(()=>selectAfterCheckpoint({...state,unit_state},units));
  assert.throws(()=>selectAfterCheckpoint({...state,auto_advance:false},units));
});

test('reselecting a blocked unit needs changed circumstances; it stays blocked pending acceptance', () => {
  const afterLibrary=units.map(u=>u.id==='library'?{...u,status:'passed'}:u);
  const cp={...checkpoint,unit_id:'library',next_task:'model',test_results:{unit_acceptance:'PASS'}};
  const done={...state,unit_state:'passed',active_unit:'library',checkpoint:cp};
  assert.throws(()=>selectAfterCheckpoint(done,afterLibrary));
  assert.equal(selectAfterCheckpoint({...done,checkpoint:{...cp,retry_basis:'route available',retry_evidence:'docs/evidence/recheck.json'}},afterLibrary).unit_state,'blocked');
});

test('final acceptance also waits for units outside its declared direct dependencies', () => {
  const final={id:'CHECK-004',status:'planned',depends_on:['base']};
  assert(!readyQueue([...units,final]).includes(final.id));
  assert.deepEqual(readyQueue([...units.map(u=>({...u,status:'passed'})),final]),[final.id]);
});
