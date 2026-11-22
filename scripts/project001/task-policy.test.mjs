import assert from 'node:assert/strict'
import test from 'node:test'
import { decideAssignment, validTaskCriteria, validTaskDraft } from '../../packages/knowledgeos-panel/src/host/project-task-policy.ts'

const now='2026-11-22T04:00:00.000Z', due_at='2026-11-23T04:00:00.000Z'
const admin={id:'admin',role:'admin'}, member={id:'member',role:'member'}, peer={id:'peer',role:'member'}
const criteria={items:[{description:'Main path verified',weight:1}],submission_rule:'next_submission'}
const draft={title:'Delivery',goal:'Verify the release build',due_at,assignee_id:member.id,final_reviewer_id:admin.id,criteria}
const members=[admin,member,peer]

test('an administrator issues only with an active administrator final reviewer and distinct optional peer',()=>{
  assert.deepEqual(decideAssignment({...draft,peer_reviewer_id:peer.id},admin,members,now),{kind:'project_admin'})
  assert.deepEqual(decideAssignment({...draft,final_reviewer_id:peer.id},admin,members,now),{error:'TASK_REVIEW_POLICY_REJECTED'})
  assert.deepEqual(decideAssignment({...draft,peer_reviewer_id:member.id},admin,members,now),{error:'TASK_REVIEW_POLICY_REJECTED'})
  assert.deepEqual(decideAssignment({...draft,peer_reviewer_id:peer.id},admin,[admin,member],now),{error:'TASK_MEMBER_UNAVAILABLE'})
  assert.deepEqual(decideAssignment(draft,admin,[admin,peer],now),{error:'TASK_MEMBER_UNAVAILABLE'})
})

test('collaboration and personal task ownership do not cross their boundaries',()=>{
  assert.deepEqual(decideAssignment({...draft,final_reviewer_id:peer.id},member,members,now),{kind:'project_collaboration'})
  assert.deepEqual(decideAssignment({...draft,peer_reviewer_id:peer.id},member,members,now),{error:'TASK_REVIEW_POLICY_REJECTED'})
  assert.deepEqual(decideAssignment({...draft,final_reviewer_id:member.id},member,null,now),{kind:'personal'})
  assert.deepEqual(decideAssignment(draft,member,null,now),{error:'TASK_REVIEW_POLICY_REJECTED'})
  assert.deepEqual(decideAssignment(draft,admin,null,now),{error:'TASK_REVIEW_POLICY_REJECTED'})
})

test('the exact deadline, normalized criteria and positive weights are checked before writes',()=>{
  assert.equal(validTaskDraft(draft),true)
  assert.equal(validTaskDraft({...draft,title:'\u202eSpoof'}),false)
  for (const due_at of [now,'2026-11-22T12:30:00+08:00','2026-11-31T00:00:00.000Z'])
    assert.deepEqual(decideAssignment({...draft,due_at},admin,members,now),{error:'INVALID_TASK_DUE'})
  for (const items of [[],[{description:'   ',weight:1}],[{description:'test',weight:0}],[{description:'test',weight:1.5}],
    [{description:'Caf\u00e9',weight:1},{description:'Cafe\u0301 ',weight:2}]]) assert.equal(validTaskCriteria({...criteria,items}),false)
  assert.equal(validTaskCriteria({...criteria,submission_rule:'retroactive'}),false)
})
