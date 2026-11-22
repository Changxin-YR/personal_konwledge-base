export interface TaskCriterion { description: string; weight: number }
export interface TaskCriteria { items: TaskCriterion[]; submission_rule: 'next_submission' }
export interface TaskMember { id: string; role: 'admin' | 'member' }
export interface TaskDraft {
  title: string; goal: string; due_at: string; assignee_id: string; final_reviewer_id: string;
  peer_reviewer_id?: string; criteria: TaskCriteria
}
export type TaskKind = 'personal' | 'project_admin' | 'project_collaboration'
export type AssignmentDecision = { kind: TaskKind } | { error: 'INVALID_TASK_DUE' | 'TASK_MEMBER_UNAVAILABLE' | 'TASK_REVIEW_POLICY_REJECTED' }

const unacceptable = /[\p{Cf}\p{Cs}\x00-\x08\x0b-\x1f\x7f]/u
const text = (value: string, max: number) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= max && !unacceptable.test(value)
const instant = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

export function validTaskCriteria(criteria: TaskCriteria) {
  if (criteria?.submission_rule !== 'next_submission' || !Array.isArray(criteria.items) || !criteria.items.length || criteria.items.length > 20) return false
  const seen = new Set<string>()
  return criteria.items.every(item => {
    if (!item || !text(item.description, 1000) || !Number.isSafeInteger(item.weight) || item.weight < 1 || item.weight > 100) return false
    const label = item.description.trim().normalize('NFC')
    if (seen.has(label)) return false
    seen.add(label)
    return true
  })
}

export function validTaskDraft(draft: TaskDraft) {
  return text(draft.title, 160) && text(draft.goal, 4000) && validTaskCriteria(draft.criteria)
}

/** The caller supplies current authorized members, never role claims from a draft. */
export function decideAssignment(draft: TaskDraft, issuer: TaskMember, projectMembers: readonly TaskMember[] | null, now: string): AssignmentDecision {
  if (!instant(draft.due_at) || draft.due_at <= now) return { error:'INVALID_TASK_DUE' }
  if (projectMembers === null) {
    if (draft.assignee_id !== issuer.id || draft.final_reviewer_id !== issuer.id || draft.peer_reviewer_id !== undefined)
      return { error:'TASK_REVIEW_POLICY_REJECTED' }
    return { kind:'personal' }
  }
  const assignee = projectMembers.find(m => m.id === draft.assignee_id)
  const final = projectMembers.find(m => m.id === draft.final_reviewer_id)
  const peer = draft.peer_reviewer_id !== undefined ? projectMembers.find(m => m.id === draft.peer_reviewer_id) : undefined
  if (!assignee || !final || draft.peer_reviewer_id !== undefined && !peer) return { error:'TASK_MEMBER_UNAVAILABLE' }
  if (final.id === assignee.id || peer && (peer.id === final.id || peer.id === assignee.id) ||
      issuer.role === 'admin' && final.role !== 'admin' || issuer.role !== 'admin' && peer)
    return { error:'TASK_REVIEW_POLICY_REJECTED' }
  return { kind:issuer.role === 'admin' ? 'project_admin' : 'project_collaboration' }
}
