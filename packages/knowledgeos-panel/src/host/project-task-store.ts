import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import { isGrantActive, type ProjectMembership } from './authorization.ts'
import type { SessionActor } from './identity.ts'
import type { ParseTx } from './parse-store.ts'
import { decideAssignment, validTaskCriteria, validTaskDraft, type TaskCriteria, type TaskDraft, type TaskKind, type TaskMember } from './project-task-policy.ts'
import { decideTaskWorkflow, isTaskReviewAction, submissionTiming, validTaskReview, validTaskSubmission, type ReviewAction, type TaskReview } from './project-task-workflow.ts'

export const PROJECT_TASK_SCHEMA = `
CREATE TABLE project_membership_removals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES knowledge_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id), removed_by TEXT NOT NULL REFERENCES users(id), removed_at TEXT NOT NULL
) STRICT;
CREATE INDEX project_membership_removal_history ON project_membership_removals(project_id,user_id,removed_at);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  project_id TEXT REFERENCES knowledge_projects(id), issuer_id TEXT NOT NULL REFERENCES users(id),
  personal_space_id TEXT REFERENCES spaces(id), assignee_id TEXT NOT NULL REFERENCES users(id),
  task_kind TEXT NOT NULL CHECK(task_kind IN ('personal','project_admin','project_collaboration')),
  title TEXT NOT NULL, goal TEXT NOT NULL, due_at TEXT NOT NULL,
  final_reviewer_id TEXT NOT NULL REFERENCES users(id), peer_reviewer_id TEXT REFERENCES users(id),
  criteria_revision INTEGER NOT NULL CHECK(criteria_revision>=1), current_state TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1), issued_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,issuer_id,request_key),
  FOREIGN KEY(id,criteria_revision) REFERENCES task_criteria_versions(task_id,version) DEFERRABLE INITIALLY DEFERRED,
  CHECK((task_kind='personal' AND project_id IS NULL AND personal_space_id IS NOT NULL AND issuer_id=assignee_id
    AND issuer_id=final_reviewer_id AND peer_reviewer_id IS NULL) OR
    (task_kind!='personal' AND project_id IS NOT NULL AND personal_space_id IS NULL AND final_reviewer_id!=assignee_id))
) STRICT;
CREATE INDEX tasks_scope_order ON tasks(service_id,project_id,issued_at DESC,id);
CREATE TABLE task_criteria_versions (
  task_id TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL CHECK(version>=1),
  acceptance_items TEXT NOT NULL, effective_submission_rule TEXT NOT NULL CHECK(effective_submission_rule='next_submission'),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(task_id,version)
) STRICT;
`

interface ProjectRow { id:string; name:string; owner_user_id:string }
interface ActiveMember extends TaskMember { display_name:string }
interface TaskRow {
  id:string; service_id:string; project_id:string|null; personal_space_id:string|null; issuer_id:string; assignee_id:string;
  task_kind:TaskKind; title:string; goal:string; due_at:string; final_reviewer_id:string; peer_reviewer_id:string|null;
  criteria_revision:number; current_state:string; revision:number; issued_at:string; updated_at:string; request_digest:string
}
interface SubmissionRow {
  id:string; task_id:string; version:number; criteria_version:number; author_id:string; content:string;
  submitted_at:string; previous_version:number|null; request_digest:string
}
interface ReviewRow {
  id:string; submission_id:string; reviewer_id:string; stage:string; verdict:string; criteria_results:string;
  reason:string; requested_work:string|null; decided_at:string; request_digest:string
}
const hidden = () => new AssetError(404,'NOT_FOUND')
const invalid = () => new AssetError(422,'INVALID_TASK_INPUT')
const submissionView = (t:TaskRow,r:SubmissionRow) => ({id:r.id,version:r.version,criteria_version:r.criteria_version,
  author_id:r.author_id,content:r.content,submitted_at:r.submitted_at,previous_version:r.previous_version,timing:submissionTiming(r.submitted_at,t.due_at)})
const reviewView = (r:ReviewRow) => ({id:r.id,submission_id:r.submission_id,reviewer_id:r.reviewer_id,stage:r.stage,verdict:r.verdict,
  criteria_results:JSON.parse(r.criteria_results),reason:r.reason,requested_work:r.requested_work,decided_at:r.decided_at})
const requestDigest = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const workflow = (t:TaskRow) => ({kind:t.task_kind,assignee:t.assignee_id,peerReviewer:t.peer_reviewer_id,
  finalReviewer:t.final_reviewer_id,state:t.current_state})
const nextActor = (t:TaskRow) => {
  switch(t.current_state){
    case 'assigned':case 'in_progress':case 'returned': return t.assignee_id
    case 'submitted': return t.peer_reviewer_id??t.final_reviewer_id
    case 'awaiting_admin_review': return t.final_reviewer_id
    default: return null
  }
}
const taskSummary = (t:TaskRow) => ({
  id:t.id, project_id:t.project_id, task_kind:t.task_kind, title:t.title, goal:t.goal, due_at:t.due_at,
  issuer_id:t.issuer_id, assignee_id:t.assignee_id, final_reviewer_id:t.final_reviewer_id, peer_reviewer_id:t.peer_reviewer_id,
  criteria_revision:t.criteria_revision, state:t.current_state, next_actor_id:nextActor(t), revision:t.revision, issued_at:t.issued_at, updated_at:t.updated_at,
})
const taskView = (db:DatabaseSync,t:TaskRow) => ({...taskSummary(t),criteria_history:db.prepare(
  'SELECT version,acceptance_items,effective_submission_rule,created_by,created_at FROM task_criteria_versions WHERE task_id=? ORDER BY version'
).all(t.id).map(({acceptance_items,...r})=>({...r,items:JSON.parse(String(acceptance_items))}))})
const clean = (c:TaskCriteria) => c.items.map(item=>({description:item.description.trim(),weight:item.weight}))
const requireRevision = (task:TaskRow,expected:number) => {
  if(task.revision!==expected)throw new AssetError(409,'TASK_REVISION_CONFLICT')
}
const validRevision = (revision:number) => Number.isSafeInteger(revision)&&revision>0
const latestSubmission = (db:DatabaseSync,id:string) => db.prepare('SELECT * FROM task_submissions WHERE task_id=? ORDER BY version DESC LIMIT 1')
  .get(id) as unknown as SubmissionRow|undefined
const advance = (db:DatabaseSync,task:TaskRow,state:string,now:string) => {
  const result=db.prepare('UPDATE tasks SET current_state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(state,now,task.id,task.revision)
  if(Number(result.changes)!==1)throw new AssetError(409,'TASK_REVISION_CONFLICT')
}
const transition = (task:TaskRow,a:SessionActor,action:'submit'|ReviewAction) => {
  const next=decideTaskWorkflow(workflow(task),{id:a.userId,role:a.role},action)
  if('error' in next)throw new AssetError(next.error==='NOT_FOUND'?404:next.error==='INVALID_TASK_INPUT'?422:409,next.error)
  return next.state
}

export class ProjectTaskStore {
  constructor(private readonly tx:ParseTx,private readonly current:(s:SessionActor,now:string)=>SessionActor|undefined,
    private readonly memberships:(db:DatabaseSync,projectId:string)=>ProjectMembership[]) {}

  private actor(s:SessionActor,now:string,expected=s.userId) {
    const user=this.current(s,now)
    if(!user)throw new AssetError(401,'AUTH_REQUIRED')
    if(user.userId!==expected)throw new AssetError(409,'ACTOR_MISMATCH')
    return user
  }

  private project(db:DatabaseSync,a:SessionActor,id:string,now:string) {
    const row=db.prepare("SELECT id,name,owner_user_id FROM knowledge_projects WHERE id=? AND service_id=? AND status='active'").get(id,a.serviceId) as unknown as ProjectRow|undefined
    if(!row)throw hidden()
    const active=this.memberships(db,id).filter(m=>isGrantActive(m,now))
    if(!active.some(m=>m.userId===a.userId))throw hidden()
    return {row,active}
  }

  private participants(db:DatabaseSync,a:SessionActor,active:readonly ProjectMembership[]):ActiveMember[] {
    const ids=[...new Set(active.map(m=>m.userId))]
    const rows=db.prepare("SELECT id,role,display_name FROM users WHERE planning_home_service_id=? AND status='active' AND id IN (SELECT value FROM json_each(?)) ORDER BY display_name,id LIMIT 501")
      .all(a.serviceId,JSON.stringify(ids)) as unknown as ActiveMember[]
    if(rows.length>500)throw new AssetError(409,'PROJECT_MEMBER_LIMIT')
    return rows
  }

  projects(s:SessionActor) {
    return this.tx('read',(db,now)=>{
      const a=this.actor(s,now)
      const rows=db.prepare(`SELECT id,name,owner_user_id FROM knowledge_projects p WHERE service_id=? AND status='active' AND (
        EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=p.id AND m.user_id=? AND m.valid_from<=? AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>?))
        OR EXISTS(SELECT 1 FROM invitations i JOIN invitation_redemptions r ON r.invitation_id=i.id WHERE i.project_id=p.id AND i.service_id=p.service_id AND i.permission='member'
          AND i.revoked_at IS NULL AND r.user_id=? AND r.revoked_at IS NULL AND r.redeemed_at<=? AND r.expires_at=i.expires_at AND r.expires_at>?)
        ) ORDER BY name,id LIMIT 201`).all(a.serviceId,a.userId,now,now,a.userId,now,now)
      if(rows.length>200)throw new AssetError(409,'PROJECT_LIST_LIMIT')
      return rows.map(row=>({id:String(row.id),name:String(row.name),can_manage:row.owner_user_id===a.userId}))
    })
  }

  members(s:SessionActor,id:string) {
    return this.tx('read',(db,now)=>{
      const a=this.actor(s,now), {row,active}=this.project(db,a,id,now)
      return {id:row.id,name:row.name,owner_id:row.owner_user_id,can_manage:row.owner_user_id===a.userId,members:this.participants(db,a,active)}
    })
  }

  removeMember(s:SessionActor,expected:string,projectId:string,memberId:string) {
    return this.tx('write',(db,now)=>{
      const a=this.actor(s,now,expected), {row,active}=this.project(db,a,projectId,now)
      if(row.owner_user_id!==a.userId||memberId===a.userId||!active.some(m=>m.userId===memberId))throw hidden()
      db.prepare('UPDATE project_memberships SET revoked_at=? WHERE project_id=? AND user_id=? AND revoked_at IS NULL').run(now,projectId,memberId)
      db.prepare(`UPDATE invitation_redemptions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND invitation_id IN
        (SELECT i.id FROM invitations i LEFT JOIN knowledge_objects o ON o.id=i.object_id
          WHERE i.service_id=? AND (i.project_id=? OR o.project_id=?))`).run(now,memberId,a.serviceId,projectId,projectId)
      // Rejoining does not restore direct grants from the previous membership.
      db.prepare(`UPDATE resource_grants SET revoked_at=? WHERE service_id=? AND subject_type='user' AND subject_id=? AND revoked_at IS NULL
        AND resource_type='knowledge_object' AND resource_id IN (SELECT id FROM knowledge_objects WHERE project_id=?)`).run(now,a.serviceId,memberId,projectId)
      db.prepare('INSERT INTO project_membership_removals VALUES(?,?,?,?,?)').run(randomUUID(),projectId,memberId,a.userId,now)
      return {removed:true}
    })
  }

  private lookup(db:DatabaseSync,a:SessionActor,id:string,now:string) {
    const row=db.prepare('SELECT * FROM tasks WHERE id=? AND service_id=?').get(id,a.serviceId) as unknown as TaskRow|undefined
    if(!row)throw hidden()
    if(row.project_id===null){if(row.personal_space_id!==a.personalSpaceId||row.issuer_id!==a.userId)throw hidden()}
    else {
      const {row:project}=this.project(db,a,row.project_id,now)
      if(![project.owner_user_id,row.issuer_id,row.assignee_id,row.final_reviewer_id,row.peer_reviewer_id].includes(a.userId))throw hidden()
    }
    return row
  }

  checkAccess(s:SessionActor,projectId:string|null,taskId?:string) {
    return this.tx('read',(db,now)=>{
      const a=this.actor(s,now)
      if(projectId!==null)this.project(db,a,projectId,now)
      if(taskId&&this.lookup(db,a,taskId,now).project_id!==projectId)throw hidden()
      return {allowed:true}
    })
  }

  get(s:SessionActor,id:string) {
    return this.tx('read',(db,now)=>taskView(db,this.lookup(db,this.actor(s,now),id,now)))
  }

  list(s:SessionActor,projectId:string|null) {
    return this.tx('read',(db,now)=>{
      const a=this.actor(s,now)
      const rows=projectId===null?db.prepare(`SELECT * FROM tasks WHERE service_id=? AND project_id IS NULL AND personal_space_id=? AND issuer_id=? ORDER BY issued_at DESC,id LIMIT 201`)
        .all(a.serviceId,a.personalSpaceId,a.userId):
        db.prepare(`SELECT * FROM tasks WHERE service_id=? AND project_id=? AND (? OR ? IN (issuer_id,assignee_id,final_reviewer_id,peer_reviewer_id))
          ORDER BY issued_at DESC,id LIMIT 201`).all(a.serviceId,projectId,Number(this.project(db,a,projectId,now).row.owner_user_id===a.userId),a.userId)
      if(rows.length>200)throw new AssetError(409,'TASK_LIST_LIMIT')
      return (rows as unknown as TaskRow[]).map(taskSummary)
    })
  }

  assign(s:SessionActor,expected:string,projectId:string|null,key:string,d:TaskDraft) {
    if(!validTaskDraft(d))throw invalid()
    const title=d.title.trim(),goal=d.goal.trim(),items=clean(d.criteria),peer=d.peer_reviewer_id??null
    const digest=createHash('sha256').update(JSON.stringify([projectId,title,goal,d.due_at,d.assignee_id,d.final_reviewer_id,peer,items])).digest('hex')
    return this.tx('write',(db,now)=>{
      const a=this.actor(s,now,expected), project=projectId===null?null:this.project(db,a,projectId,now)
      if(project&&project.row.owner_user_id!==a.userId)throw hidden()
      const old=db.prepare('SELECT id,request_digest FROM tasks WHERE service_id=? AND issuer_id=? AND request_key=?').get(a.serviceId,a.userId,key)
      if(old){if(old.request_digest!==digest)throw new AssetError(409,'TASK_REQUEST_CONFLICT');return {task:taskView(db,this.lookup(db,a,String(old.id),now)),replayed:true}}
      const decision=decideAssignment(d,{id:a.userId,role:a.role},project&&this.participants(db,a,project.active),now)
      if('error' in decision)throw new AssetError(decision.error==='TASK_MEMBER_UNAVAILABLE'?409:422,decision.error)
      const id=randomUUID()
      db.prepare(`INSERT INTO tasks(id,service_id,project_id,issuer_id,personal_space_id,assignee_id,task_kind,title,goal,due_at,final_reviewer_id,
        peer_reviewer_id,criteria_revision,current_state,revision,issued_at,updated_at,request_key,request_digest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,'assigned',1,?,?,?,?)`)
        .run(id,a.serviceId,projectId,a.userId,projectId===null?a.personalSpaceId:null,d.assignee_id,decision.kind,title,goal,d.due_at,d.final_reviewer_id,peer,now,now,key,digest)
      db.prepare("INSERT INTO task_criteria_versions VALUES(?,1,?,'next_submission',?,?)").run(id,JSON.stringify(items),a.userId,now)
      return {task:taskView(db,this.lookup(db,a,id,now)),replayed:false}
    })
  }

  revise(s:SessionActor,expected:string,id:string,revision:number,criteria:TaskCriteria) {
    if(!Number.isSafeInteger(revision)||revision<1||!validTaskCriteria(criteria))throw invalid()
    const items=JSON.stringify(clean(criteria))
    return this.tx('write',(db,now)=>{
      const a=this.actor(s,now,expected), task=this.lookup(db,a,id,now)
      if(task.issuer_id!==a.userId)throw hidden()
      if(task.revision!==revision)throw new AssetError(409,'TASK_REVISION_CONFLICT')
      if(!['assigned','returned'].includes(task.current_state))throw new AssetError(409,'TASK_STATE_CONFLICT')
      const prior=db.prepare('SELECT acceptance_items FROM task_criteria_versions WHERE task_id=? AND version=?').get(id,task.criteria_revision)
      if(prior?.acceptance_items===items)return taskView(db,task)
      if(task.criteria_revision>=50)throw new AssetError(409,'TASK_CRITERIA_LIMIT')
      const next=task.criteria_revision+1
      db.prepare("INSERT INTO task_criteria_versions VALUES(?,?,?,'next_submission',?,?)").run(id,next,items,a.userId,now)
      const changed=db.prepare('UPDATE tasks SET criteria_revision=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').run(next,now,id,revision)
      if(Number(changed.changes)!==1)throw new AssetError(409,'TASK_REVISION_CONFLICT')
      return taskView(db,this.lookup(db,a,id,now))
    })
  }

  history(s:SessionActor,id:string) {
    return this.tx('read',(db,now)=>{
      const task=this.lookup(db,this.actor(s,now),id,now)
      const submissions=db.prepare('SELECT * FROM task_submissions WHERE task_id=? ORDER BY version').all(id) as unknown as SubmissionRow[]
      const reviews=db.prepare(`SELECT d.* FROM task_review_decisions d JOIN task_submissions s ON s.id=d.submission_id
        WHERE s.task_id=? ORDER BY s.version,CASE d.stage WHEN 'peer' THEN 0 ELSE 1 END`).all(id) as unknown as ReviewRow[]
      return {task_revision:task.revision,submissions:submissions.map(r=>submissionView(task,r)),reviews:reviews.map(reviewView)}
    })
  }

  submit(s:SessionActor,expected:string,id:string,key:string,revision:number,content:unknown) {
    if(!validRevision(revision)||!validTaskSubmission(content))throw invalid()
    const normalized=content.trim(), digest=requestDigest([revision,normalized])
    return this.tx('write',(db,now)=>{
      const a=this.actor(s,now,expected),task=this.lookup(db,a,id,now)
      if(task.assignee_id!==a.userId)throw hidden()
      const old=db.prepare('SELECT * FROM task_submissions WHERE task_id=? AND author_id=? AND request_key=?')
        .get(id,a.userId,key) as unknown as SubmissionRow|undefined
      if(old){
        if(old.request_digest!==digest)throw new AssetError(409,'TASK_REQUEST_CONFLICT')
        return {task:taskView(db,task),submission:submissionView(task,old),replayed:true}
      }
      requireRevision(task,revision)
      const state=transition(task,a,'submit'), previous=latestSubmission(db,id)
      const version=(previous?.version??0)+1
      if(version>50)throw new AssetError(409,'TASK_SUBMISSION_LIMIT')
      const submissionId=randomUUID()
      db.prepare(`INSERT INTO task_submissions(id,task_id,version,criteria_version,author_id,content,submitted_at,previous_version,request_key,request_digest)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(submissionId,id,version,task.criteria_revision,a.userId,normalized,now,previous?.version??null,key,digest)
      advance(db,task,state,now)
      const saved=latestSubmission(db,id)!
      return {task:taskView(db,this.lookup(db,a,id,now)),submission:submissionView(task,saved),replayed:false}
    })
  }

  review(s:SessionActor,expected:string,id:string,key:string,revision:number,submissionId:string,action:ReviewAction,input:TaskReview) {
    if(!validRevision(revision)||!isTaskReviewAction(action))throw invalid()
    const stage=action.startsWith('peer_')?'peer':'final', verdict=action.slice(stage.length+1)
    return this.tx('write',(db,now)=>{
      const a=this.actor(s,now,expected),task=this.lookup(db,a,id,now)
      if(stage==='peer'?a.userId!==task.peer_reviewer_id:a.userId!==task.final_reviewer_id||a.role!=='admin')throw hidden()
      if(task.task_kind!=='project_admin')throw new AssetError(409,'TASK_WORKFLOW_UNAVAILABLE')
      const submission=db.prepare('SELECT * FROM task_submissions WHERE task_id=? AND id=?').get(id,submissionId) as unknown as SubmissionRow|undefined
      if(!submission)throw hidden()
      const {acceptance_items}=db.prepare('SELECT acceptance_items FROM task_criteria_versions WHERE task_id=? AND version=?').get(id,submission.criteria_version)!
      if(!validTaskReview(action,JSON.parse(String(acceptance_items)).length,input))throw invalid()
      const results=input.results.map(r=>({criterion:r.criterion,met:r.met,evidence:r.evidence.trim()})).sort((l,r)=>l.criterion-r.criterion)
      const reason=input.reason.trim(),requested=input.requested_work?.trim()??null
      const digest=requestDigest([revision,action,results,reason,requested])
      const old=db.prepare('SELECT * FROM task_review_decisions WHERE submission_id=? AND reviewer_id=? AND request_key=?')
        .get(submissionId,a.userId,key) as unknown as ReviewRow|undefined
      if(old){
        if(old.request_digest!==digest)throw new AssetError(409,'TASK_REQUEST_CONFLICT')
        return {task:taskView(db,task),review:reviewView(old),replayed:true}
      }
      requireRevision(task,revision)
      if(latestSubmission(db,id)?.id!==submissionId)throw new AssetError(409,'TASK_SUBMISSION_CONFLICT')
      const state=transition(task,a,action), reviewId=randomUUID()
      db.prepare(`INSERT INTO task_review_decisions(id,submission_id,reviewer_id,stage,verdict,criteria_results,reason,requested_work,decided_at,request_key,request_digest)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(reviewId,submissionId,a.userId,stage,verdict,JSON.stringify(results),reason,requested,now,key,digest)
      advance(db,task,state,now)
      const saved=db.prepare('SELECT * FROM task_review_decisions WHERE id=?').get(reviewId) as unknown as ReviewRow
      return {task:taskView(db,this.lookup(db,a,id,now)),review:reviewView(saved),replayed:false}
    })
  }
}
