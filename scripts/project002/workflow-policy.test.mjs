import assert from 'node:assert/strict'
import test from 'node:test'
import {decideTaskCorrection,decideTaskWorkflow,submissionTiming,validTaskReview} from '../../packages/knowledgeos-panel/src/host/project-task-workflow.ts'

const base={kind:'project_admin',assignee:'worker',peerReviewer:'peer',finalReviewer:'admin',state:'assigned'}
const worker={id:'worker',role:'member'}, peer={id:'peer',role:'member'}, admin={id:'admin',role:'admin'}
const step=(state,actor,action,overrides={})=>decideTaskWorkflow({...base,state,...overrides},actor,action)

test('the assignee submits or resubmits; an assigned peer gates administrator completion',()=>{
  const waiting={state:'submitted',nextActor:'peer'}
  assert.deepEqual(step('assigned',worker,'submit'),waiting)
  assert.deepEqual(step('in_progress',worker,'submit'),waiting)
  assert.deepEqual(step('returned',worker,'submit'),waiting)
  assert.deepEqual(step('assigned',admin,'submit'),{error:'NOT_FOUND'})
  assert.deepEqual(step('submitted',worker,'submit'),{error:'TASK_STATE_CONFLICT'})
  assert.deepEqual(step('submitted',admin,'final_accept'),{error:'TASK_STATE_CONFLICT'})
  assert.deepEqual(step('submitted',peer,'peer_pass'),{state:'awaiting_admin_review',nextActor:'admin'})
  assert.deepEqual(step('awaiting_admin_review',peer,'final_accept'),{error:'NOT_FOUND'})
  assert.deepEqual(step('awaiting_admin_review',{...admin,role:'member'},'final_accept'),{error:'NOT_FOUND'})
  assert.deepEqual(step('awaiting_admin_review',admin,'final_accept'),{state:'accepted',nextActor:null})
  assert.deepEqual(step('assigned',worker,'submit',{peerReviewer:null}),{state:'submitted',nextActor:'admin'})
  assert.deepEqual(step('submitted',admin,'final_accept',{peerReviewer:null}),{state:'accepted',nextActor:null})
})

test('return, blocked, and formal failure remain distinct',()=>{
  assert.deepEqual(step('submitted',peer,'peer_return'),{state:'returned',nextActor:'worker'})
  assert.deepEqual(step('awaiting_admin_review',admin,'final_return'),{state:'returned',nextActor:'worker'})
  assert.deepEqual(step('awaiting_admin_review',admin,'final_fail'),{state:'failed',nextActor:null})
  assert.deepEqual(step('blocked',worker,'submit'),{error:'TASK_STATE_CONFLICT'})
  assert.deepEqual(step('awaiting_material_access',admin,'final_fail'),{error:'TASK_STATE_CONFLICT'})
  assert.deepEqual(step('assigned',worker,'submit',{kind:'project_collaboration',peerReviewer:null}),{state:'submitted',nextActor:'admin'})
  assert.deepEqual(step('assigned',worker,'submit',{kind:'personal'}),{error:'TASK_WORKFLOW_UNAVAILABLE'})
  assert.deepEqual(step('awaiting_admin_review',admin,'final_force'),{error:'INVALID_TASK_INPUT'})
})

test('ordinary review belongs to the designated reviewer and a formal decision precedes correction',()=>{
  const ordinary={kind:'project_collaboration',peerReviewer:null,finalReviewer:peer.id};
  assert.deepEqual(step('submitted',peer,'final_accept',ordinary),{state:'accepted',nextActor:null})
  assert.deepEqual(step('submitted',admin,'final_accept',ordinary),{error:'NOT_FOUND'})
  assert.deepEqual(step('submitted',peer,'peer_pass',ordinary),{error:'TASK_WORKFLOW_UNAVAILABLE'})
  const task={...base,...ordinary,state:'accepted'};
  assert.deepEqual(decideTaskCorrection(task,peer,'final_fail'),{error:'NOT_FOUND'})
  assert.deepEqual(decideTaskCorrection({...task,assignee:admin.id},admin,'final_accept'),{error:'NOT_FOUND'})
  assert.deepEqual(decideTaskCorrection({...task,state:'submitted'},admin,'final_fail'),{error:'TASK_STATE_CONFLICT'})
  assert.deepEqual(decideTaskCorrection(task,admin,'final_fail'),{state:'failed',nextActor:null})
  assert.deepEqual(decideTaskCorrection(task,admin,'final_return'),{state:'returned',nextActor:'worker'})
})

test('only the server submission timestamp classifies a timely attempt',()=>{
  const due='2026-11-22T05:00:00.000Z'
  assert.equal(submissionTiming('2026-11-22T04:59:59.999Z',due),'on_time')
  assert.equal(submissionTiming(due,due),'on_time')
  assert.equal(submissionTiming('2026-11-22T05:00:00.001Z',due),'late')
})

test('review requires one result per frozen criterion and a return carries actionable evidence',()=>{
  const results=[{criterion:1,met:true,evidence:'Observed output'},{criterion:2,met:false,evidence:'Missing reproduction'}]
  assert(validTaskReview('final_return',2,{results,reason:'Criterion 2 has no reproduction',requested_work:'Add exact steps'}))
  assert(!validTaskReview('peer_return',2,{results,reason:'Incomplete',requested_work:'   '}))
  assert(!validTaskReview('final_fail',2,{results,reason:'   '}))
  assert(!validTaskReview('final_return',2,{results:[results[0],results[0]],reason:'Incomplete',requested_work:'Add notes'}))
  assert(!validTaskReview('peer_pass',2,{results,reason:'Ready'}))
  const met=results.map(r=>({...r,met:true}))
  assert(validTaskReview('peer_pass',2,{results:met,reason:'Ready for final'}))
  assert(!validTaskReview('final_fail',2,{results:met,reason:'Not ready'}))
  assert(!validTaskReview('final_accept',2,{results:[{...met[0],met:'true'},met[1]],reason:'Ready'}))
  assert(!validTaskReview('final_return',2,{results:[results[0],{...results[1],evidence:' '}],reason:'Incomplete',requested_work:'Add notes'}))
  assert(!validTaskReview('final_force',2,{results,reason:'Unsupported'}))
})
