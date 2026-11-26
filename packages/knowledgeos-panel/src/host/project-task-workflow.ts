import type { TaskKind, TaskMember } from './project-task-policy.ts'

type FinalAction = 'final_accept' | 'final_return' | 'final_fail'
export type ReviewAction = 'peer_pass' | 'peer_return' | FinalAction
type Action = 'submit' | ReviewAction
type ResultState = 'submitted' | 'awaiting_admin_review' | 'returned' | 'accepted' | 'failed'
export interface TaskWorkflow {
  kind: TaskKind
  assignee: string
  peerReviewer: string | null
  finalReviewer: string
  state: string
}
type Decision = {state:ResultState;nextActor:string|null} | {error:'NOT_FOUND'|'TASK_STATE_CONFLICT'|'TASK_WORKFLOW_UNAVAILABLE'|'INVALID_TASK_INPUT'}

export interface CriterionResult { criterion: number; met: boolean; evidence: string }
export interface TaskReview { results: CriterionResult[]; reason: string; requested_work?: string }
export const isTaskReviewAction=(action:unknown):action is ReviewAction =>
  action==='peer_pass'||action==='peer_return'||action==='final_accept'||action==='final_return'||action==='final_fail'

/** The store resolves actor, current membership, task and submission inside the write transaction. */
export function decideTaskWorkflow(task:TaskWorkflow, actor:TaskMember, action:Action):Decision {
  if(action!=='submit'&&!isTaskReviewAction(action))return {error:'INVALID_TASK_INPUT'}
  if(task.kind==='personal')return {error:'TASK_WORKFLOW_UNAVAILABLE'}
  if(action==='submit'){
    if(actor.id!==task.assignee)return {error:'NOT_FOUND'}
    if(!['assigned','in_progress','returned'].includes(task.state))return {error:'TASK_STATE_CONFLICT'}
    return {state:'submitted',nextActor:task.peerReviewer??task.finalReviewer}
  }
  if(action==='peer_pass'||action==='peer_return'){
    if(task.kind!=='project_admin')return {error:'TASK_WORKFLOW_UNAVAILABLE'}
    if(actor.id!==task.peerReviewer)return {error:'NOT_FOUND'}
    if(task.state!=='submitted')return {error:'TASK_STATE_CONFLICT'}
    return action==='peer_pass'?{state:'awaiting_admin_review',nextActor:task.finalReviewer}:{state:'returned',nextActor:task.assignee}
  }
  if(actor.id!==task.finalReviewer||task.kind==='project_admin'&&actor.role!=='admin')return {error:'NOT_FOUND'}
  if(task.state!==(task.peerReviewer?'awaiting_admin_review':'submitted'))return {error:'TASK_STATE_CONFLICT'}
  return finalOutcome(task,action)
}

export function decideTaskCorrection(task:TaskWorkflow,actor:TaskMember,action:ReviewAction):Decision {
  if(task.kind!=='project_collaboration'||actor.role!=='admin'||actor.id===task.assignee)return {error:'NOT_FOUND'}
  if(action==='peer_pass'||action==='peer_return')return {error:'INVALID_TASK_INPUT'}
  if(!['accepted','failed','returned'].includes(task.state))return {error:'TASK_STATE_CONFLICT'}
  return finalOutcome(task,action)
}

function finalOutcome(task:TaskWorkflow,action:FinalAction):Decision {
  switch(action){
    case 'final_accept':return {state:'accepted',nextActor:null}
    case 'final_return':return {state:'returned',nextActor:task.assignee}
    case 'final_fail':return {state:'failed',nextActor:null}
  }
}

// Both times are canonical UTC instants from the task and the server transaction clock.
export function submissionTiming(submittedAt:string,dueAt:string):'on_time'|'late' {
  return submittedAt<=dueAt?'on_time':'late'
}

const validText=(value:unknown,limit:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=limit&&
  !/[\p{Cf}\p{Cs}\x00-\x08\x0b-\x1f\x7f]/u.test(value)
export const validTaskSubmission=(content:unknown):content is string=>validText(content,16000)

export function validTaskReview(action:ReviewAction,criterionCount:number,input:TaskReview):boolean {
  if(!isTaskReviewAction(action)||!input||!Number.isSafeInteger(criterionCount)||criterionCount<1||criterionCount>20||
    !Array.isArray(input.results)||input.results.length!==criterionCount||!validText(input.reason,4000))return false
  const isReturn=action==='peer_return'||action==='final_return'
  if(isReturn?!validText(input.requested_work,4000):input.requested_work!==undefined)return false
  const ordinals=new Set<number>()
  for(const result of input.results){
    if(!result||!Number.isSafeInteger(result.criterion)||result.criterion<1||result.criterion>criterionCount||
      ordinals.has(result.criterion)||typeof result.met!=='boolean'||!validText(result.evidence,1000))return false
    ordinals.add(result.criterion)
  }
  const allMet=input.results.every(result=>result.met)
  return allMet===(action==='peer_pass'||action==='final_accept')
}
