import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { CitationStore } from './citation-store.ts'
import type { SessionActor } from './identity.ts'
import type { ParseTx } from './parse-store.ts'
import { exactRule, fillRule, normalizeFill, scoreAnswer, type Answer, type Confidence, type GradingState, type QuestionKind } from './practice-policy.ts'
import type { GeneratedQuestion, QuickCoverage, QuickRange } from './quick-practice.ts'
import { classifyPractice, hintText, type PersonalState, type ReviewDraft } from './practice-review.ts'
import type { Difficulty, PracticeMode, TransferDraft } from './practice-transfer.ts'

export const PRACTICE_SCHEMA = `
CREATE TABLE questions (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  author_id TEXT NOT NULL REFERENCES users(id), project_id TEXT REFERENCES knowledge_projects(id),
  current_version_id TEXT NOT NULL, created_at TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  FOREIGN KEY(id,current_version_id) REFERENCES question_versions(question_id,id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(service_id,author_id,request_key)
) STRICT;
CREATE INDEX question_service ON questions(service_id,project_id,created_at,id);
CREATE TABLE question_versions (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES questions(id), version INTEGER NOT NULL CHECK(version>=1),
  kind TEXT NOT NULL CHECK(kind IN ('choice','judgment','fill')), prompt TEXT NOT NULL,
  options_json TEXT NOT NULL, answers_json TEXT NOT NULL, explanation TEXT NOT NULL, evidence_json TEXT NOT NULL,
  citation_id TEXT NOT NULL REFERENCES citations(id), grading_rule TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  UNIQUE(question_id,version), UNIQUE(question_id,id)
) STRICT;
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_identity(service_id),
  user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(service_id,user_id,request_key), UNIQUE(id,service_id,user_id)
) STRICT;
CREATE INDEX practice_owner ON practice_sessions(service_id,user_id,started_at,id);
CREATE TABLE practice_session_questions (
  session_id TEXT NOT NULL REFERENCES practice_sessions(id), question_version_id TEXT NOT NULL REFERENCES question_versions(id),
  position INTEGER NOT NULL CHECK(position>=0), PRIMARY KEY(session_id,question_version_id), UNIQUE(session_id,position)
) STRICT;
CREATE TABLE practice_attempts (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, question_version_id TEXT NOT NULL,
  service_id TEXT NOT NULL, user_id TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>=1),
  answer_json TEXT NOT NULL, confidence TEXT NOT NULL CHECK(confidence IN ('sure','unsure')),
  grading_state TEXT NOT NULL CHECK(grading_state IN ('correct','incorrect','disputed')),
  independent INTEGER NOT NULL CHECK(independent IN (0,1)), submitted_at TEXT NOT NULL,
  FOREIGN KEY(session_id,question_version_id) REFERENCES practice_session_questions(session_id,question_version_id),
  FOREIGN KEY(session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  UNIQUE(session_id,question_version_id,sequence), UNIQUE(id,service_id,user_id)
) STRICT;
CREATE INDEX practice_answer_exposure ON practice_attempts(service_id,user_id,question_version_id);
CREATE TABLE practice_attempt_receipts (
  service_id TEXT NOT NULL, user_id TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL CHECK(length(digest)=64),
  attempt_id TEXT NOT NULL, FOREIGN KEY(attempt_id,service_id,user_id) REFERENCES practice_attempts(id,service_id,user_id),
  PRIMARY KEY(service_id,user_id,request_key)
) STRICT;
`

export const QUICK_PRACTICE_SCHEMA = `
CREATE TABLE quick_practice_runs (
  service_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64), session_id TEXT UNIQUE,
  coverage_json TEXT NOT NULL, provider TEXT, model TEXT, created_at TEXT NOT NULL,
  CHECK((provider IS NULL)=(model IS NULL)), CHECK(session_id IS NULL OR provider IS NOT NULL),
  FOREIGN KEY(session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  PRIMARY KEY(service_id,user_id,request_key)
) STRICT;
CREATE TABLE quick_practice_questions (
  version_id TEXT PRIMARY KEY REFERENCES question_versions(id), session_id TEXT NOT NULL REFERENCES quick_practice_runs(session_id),
  quality TEXT NOT NULL CHECK(quality IN ('ready','needs_review'))
) STRICT;
`

export interface QuestionDraft {
  kind: QuestionKind; prompt: string; options: string[]; accepted: Answer[]; explanation: string
  source_citation_id: string; project_id: string | null; difficulty?:Difficulty
}
export interface AttemptInput { question_version_id: string; expected_sequence: number; answer: Answer; confidence: Confidence }
export interface CorrectionInput { expected_version:number; answer:Answer|Answer[]; explanation:string; reason:string }
type Citation = ReturnType<CitationStore['knowledgeSource']>
interface Question { id: string; author_id: string; project_id: string | null; current_version_id: string; request_digest: string }
interface Version {
  id: string; question_id: string; version: number; kind: QuestionKind; prompt: string; options_json: string
  answers_json: string; explanation: string; evidence_json: string; citation_id: string; grading_rule: string; difficulty:Difficulty
}
interface Practice { id: string; started_at: string; request_digest: string; mode:PracticeMode }
interface Transfer {
  id:string;source_session_id:string;source_version_id:string;first_attempt_id:string;guided_attempt_id:string
  target_version_id:string;available_at:string;created_at:string;request_digest:string
  started_session_id:string|null;start_key:string|null;started_at:string|null
}
interface Attempt {
  id: string; session_id: string; question_version_id: string; sequence: number; answer_json: string
  confidence: Confidence; grading_state: GradingState; independent: number; submitted_at: string
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const missingQuestion = () => new AssetError(404, 'QUESTION_NOT_FOUND')
const missingPractice = () => new AssetError(404, 'PRACTICE_NOT_FOUND')
const conflict = () => new AssetError(409, 'IDEMPOTENCY_CONFLICT')
const initialState:PersonalState={revision:0,wrong_reason:'',mastery_state:'new',next_review_at:null,updated_at:null}
const gradingExplanation = {
  [exactRule]: '按当前题目版本的固定标准答案判分。',
  [fillRule]: '按 NFKC 规范化、合并空白并忽略大小写后与保存的答案逐一比较，未匹配的表达等待复核。',
}

export class PracticeStore {
  constructor(private readonly tx: ParseTx, private readonly current: (actor: SessionActor, now: string) => SessionActor | undefined,
    private readonly canUseProject: (actor: SessionActor, id: string, now: string) => boolean, private readonly citations: CitationStore) {}

  private actor(prior: SessionActor, now: string) {
    const actor = this.current(prior, now)
    if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
    return actor
  }

  private visible(actor: SessionActor, question: Question, now: string) {
    return question.project_id ? this.canUseProject(actor, question.project_id, now) : question.author_id === actor.userId
  }

  private version(db: DatabaseSync, id: string) {
    const row = db.prepare('SELECT * FROM question_versions WHERE id=?').get(id) as unknown as Version | undefined
    if (!row) throw missingQuestion()
    return row
  }

  private source(db: DatabaseSync, actor: SessionActor, version: Version, now: string) {
    const pinned = JSON.parse(version.evidence_json) as Citation
    try {
      this.citations.checkStoredSelection(db, actor, pinned, now)
      return pinned
    } catch (error) {
      if (error instanceof AssetError && (error.status === 404 || error.status === 409)) throw missingQuestion()
      throw error
    }
  }

  private quickQuestion(db:DatabaseSync,id:string) {
    return db.prepare('SELECT quality FROM quick_practice_questions WHERE version_id=?').get(id)
  }

  private learner(db:DatabaseSync,question: Question, version: Version) {
    const generated=this.quickQuestion(db,version.id)
    const disputed=this.openDispute(db,question.current_version_id)
    return { id: question.id, version_id: version.id, version: version.version, kind: version.kind, prompt: version.prompt,difficulty:version.difficulty,
      options: JSON.parse(version.options_json) as string[], project_id: question.project_id, author_id: question.author_id,
      quality_state:generated?.quality??'ready',origin_kind:generated?'generated':'author',
      evaluation_eligible:!generated&&!disputed,has_open_dispute:disputed }
  }

  private feedback(version: Version, citation: Citation) {
    const accepted = JSON.parse(version.answers_json) as Answer[]
    return { accepted_answer: version.kind === 'fill' ? accepted : accepted[0], explanation: version.explanation,
      grading_rule: version.grading_rule, grading_basis: gradingExplanation[version.grading_rule as keyof typeof gradingExplanation],
      evidence: { ...citation, href: '/knowledgeos/reader?' + new URLSearchParams({ asset: citation.asset_id, version: citation.version_id, citation: citation.id }) } }
  }

  private accessVersion(db: DatabaseSync, actor: SessionActor, id: string, now: string) {
    const version = this.version(db, id)
    const question = db.prepare('SELECT * FROM questions WHERE id=? AND service_id=?').get(version.question_id, actor.serviceId) as unknown as Question | undefined
    if (!question || !this.visible(actor, question, now)) throw missingQuestion()
    return { question, version, citation: this.source(db, actor, version, now) }
  }

  catalog(prior: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const rows = db.prepare('SELECT * FROM questions WHERE service_id=? AND (author_id=? OR project_id IS NOT NULL) ORDER BY created_at DESC,id')
        .all(actor.serviceId, actor.userId) as unknown as Question[]
      const questions = rows.flatMap(question => {
        if (!this.visible(actor, question, now)) return []
        const version = this.version(db, question.current_version_id)
        try { this.source(db, actor, version, now); return [this.learner(db,question,version)] }
        catch (error) { if (error instanceof AssetError && error.status === 404) return []; throw error }
      })
      const projects = db.prepare("SELECT id,name AS title FROM knowledge_projects WHERE service_id=? AND status='active' ORDER BY name,id")
        .all(actor.serviceId).filter(project => this.canUseProject(actor, String(project.id), now))
      return { questions, projects }
    })
  }

  authored(prior: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const {question,version,citation}=this.authorQuestion(db,actor,id,now)
      return { question: this.learner(db,question,version), feedback: this.feedback(version, citation) }
    })
  }

  private authorQuestion(db:DatabaseSync,actor:SessionActor,id:string,now:string){
    const row=db.prepare('SELECT current_version_id FROM questions WHERE id=? AND service_id=? AND author_id=?').get(id,actor.serviceId,actor.userId)
    if(!row)throw missingQuestion()
    const target=this.accessVersion(db,actor,String(row.current_version_id),now)
    if(this.quickQuestion(db,target.version.id))throw missingQuestion()
    return target
  }

  createQuestion(prior: SessionActor, key: string, draft: QuestionDraft) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), digest = hash(draft)
      const old = db.prepare('SELECT * FROM questions WHERE service_id=? AND author_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key) as unknown as Question | undefined
      if (old) {
        const initial=db.prepare('SELECT id FROM question_versions WHERE question_id=? AND version=1').get(old.id)
        const { question, version } = this.accessVersion(db, actor, String(initial?.id), now)
        if (old.request_digest !== digest) throw conflict()
        return { question: this.learner(db,question,version), replayed: true }
      }
      if (draft.project_id && !this.canUseProject(actor, draft.project_id, now)) throw missingQuestion()
      const citation = this.citations.knowledgeSource(db, actor, draft.source_citation_id, now)
      const question=this.insertQuestion(db,actor,now,key,digest,draft,citation)
      return { question: this.learner(db,question,this.version(db,question.current_version_id)), replayed: false }
    })
  }

  private insertQuestion(db:DatabaseSync,actor:SessionActor,now:string,key:string,digest:string,draft:QuestionDraft,citation:Citation):Question {
    const id=randomUUID(),versionId=randomUUID()
    db.prepare('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?)').run(id,actor.serviceId,actor.userId,draft.project_id,versionId,now,key,digest)
    db.prepare(`INSERT INTO question_versions
      (id,question_id,version,kind,prompt,options_json,answers_json,explanation,evidence_json,citation_id,grading_rule,created_by,created_at,difficulty)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      versionId,id,1,draft.kind,draft.prompt,JSON.stringify(draft.options),JSON.stringify(draft.accepted),draft.explanation,
      JSON.stringify(citation),citation.id,draft.kind==='fill'?fillRule:exactRule,actor.userId,now,draft.difficulty??'basic')
    return {id,author_id:actor.userId,project_id:draft.project_id,current_version_id:versionId,request_digest:digest}
  }

  private practice(db: DatabaseSync, actor: SessionActor, id: string) {
    const row = db.prepare('SELECT id,started_at,request_digest,mode FROM practice_sessions WHERE id=? AND service_id=? AND user_id=?')
      .get(id, actor.serviceId, actor.userId) as unknown as Practice | undefined
    if (!row) throw missingPractice()
    return row
  }

  private inSession(db: DatabaseSync, actor: SessionActor, id: string, now: string) {
    return db.prepare('SELECT question_version_id FROM practice_session_questions WHERE session_id=? ORDER BY position')
      .all(id).map(row => this.accessVersion(db, actor, String(row.question_version_id), now))
  }

  private session(db:DatabaseSync,row: Practice) {
    const quick=db.prepare('SELECT coverage_json FROM quick_practice_runs WHERE session_id=?').get(row.id)
    return {id:row.id,started_at:row.started_at,mode:row.mode,...(quick?{quick_coverage:JSON.parse(String(quick.coverage_json)) as QuickCoverage}:{})}
  }

  listSessions(prior: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const rows = db.prepare('SELECT id,started_at,request_digest,mode FROM practice_sessions WHERE service_id=? AND user_id=? ORDER BY started_at DESC,id')
        .all(actor.serviceId, actor.userId) as unknown as Practice[]
      return rows.flatMap(row => {
        try {
          const questions = this.inSession(db, actor, row.id, now)
          return [{ ...this.session(db,row), count: questions.length, title: questions[0]?.version.prompt }]
        } catch (error) { if (error instanceof AssetError && error.status === 404) return []; throw error }
      })
    })
  }

  createSession(prior: SessionActor, key: string, versions: string[], mode:'standard'|'guided'='standard') {
    return this.tx('write', (db, now) => {
      const actor=this.actor(prior,now),digest=hash(mode==='standard'?versions:[mode,versions])
      const old = db.prepare('SELECT id,started_at,request_digest,mode FROM practice_sessions WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key) as unknown as Practice | undefined
      if (old) {
        this.inSession(db, actor, old.id, now)
        if (old.request_digest !== digest) throw conflict()
        return { session: this.session(db,old), replayed: true }
      }
      for (const id of versions) this.accessVersion(db, actor, id, now)
      if(mode==='guided'&&versions.length!==1)throw new AssetError(422,'GUIDED_REQUIRES_ONE_QUESTION')
      const row=this.insertSession(db,actor,now,key,digest,versions,mode)
      return { session:this.session(db,row),replayed:false }
    })
  }

  private insertSession(db:DatabaseSync,actor:SessionActor,now:string,key:string,digest:string,versions:string[],mode:PracticeMode='standard'):Practice {
    const id=randomUUID()
    db.prepare('INSERT INTO practice_sessions(id,service_id,user_id,started_at,request_key,request_digest,mode) VALUES(?,?,?,?,?,?,?)')
      .run(id,actor.serviceId,actor.userId,now,key,digest,mode)
    const add=db.prepare('INSERT INTO practice_session_questions VALUES(?,?,?)')
    versions.forEach((version,i)=>add.run(id,version,i))
    return {id,started_at:now,request_digest:digest,mode}
  }

  private checkQuickSources(db:DatabaseSync,actor:SessionActor,pinned:QuickRange,now:string){
    if(!this.citations.validateTaskMaterial(db,actor,pinned.target,now))throw missingQuestion()
    for(const item of [...pinned.sources,...(pinned.anchor?[pinned.anchor]:[])]){
      const witness=this.citations.verifySelection(db,actor,item.spec,now,item.witness)
      if(witness.text.slice(witness.start,witness.end)!==item.text)throw new AssetError(409,'QUICK_RANGE_CHANGED')
    }
  }

  private openDispute(db:DatabaseSync,versionId:string){
    return Boolean(db.prepare('SELECT 1 FROM practice_disputes WHERE question_version_id=? LIMIT 1').get(versionId))
  }

  private hints(db:DatabaseSync,sessionId:string,versionId:string){
    return db.prepare('SELECT level,for_sequence FROM practice_hint_events WHERE session_id=? AND question_version_id=? ORDER BY level')
      .all(sessionId,versionId).map(row=>{
        const level=Number(row.level) as 1|2
        return {level,text:hintText[level],for_sequence:Number(row.for_sequence)}
      })
  }

  hint(prior:SessionActor,key:string,sessionId:string,versionId:string,level:1|2){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),practice=this.practice(db,actor,sessionId)
      if(!this.inSession(db,actor,practice.id,now).some(item=>item.version.id===versionId))throw missingQuestion()
      const old=db.prepare('SELECT session_id,question_version_id,level,for_sequence FROM practice_hint_events WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId,actor.userId,key)
      const hint={level,text:hintText[level]}
      if(old){
        if(old.session_id!==sessionId||old.question_version_id!==versionId||old.level!==level)throw conflict()
        return {hint:{...hint,for_sequence:Number(old.for_sequence)},replayed:true}
      }
      const answers=this.attempts(db,sessionId,versionId)
      if(practice.mode==='transfer')throw new AssetError(409,'TRANSFER_HINTS_DISABLED')
      if(practice.mode==='guided'&&!answers.length)throw new AssetError(409,'FIRST_ANSWER_REQUIRED')
      if(practice.mode==='standard'&&answers.length)throw new AssetError(409,'HINT_AFTER_ANSWER')
      const priorLevels=this.hints(db,sessionId,versionId)
      if(level!==priorLevels.length+1)throw new AssetError(409,'HINT_LEVEL_CONFLICT')
      const for_sequence=(answers.at(-1)?.sequence??0)+1
      db.prepare('INSERT INTO practice_hint_events(id,service_id,user_id,session_id,question_version_id,level,request_key,requested_at,for_sequence) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(),actor.serviceId,actor.userId,sessionId,versionId,level,key,now,for_sequence)
      return {hint:{...hint,for_sequence},replayed:false}
    })
  }

  private solutionReveal(db:DatabaseSync,sessionId:string,versionId:string){
    return db.prepare('SELECT after_sequence,revealed_at FROM practice_solution_reveals WHERE session_id=? AND question_version_id=?')
      .get(sessionId,versionId)
  }

  private visibleFeedback(db:DatabaseSync,session:Practice,version:Version,citation:Citation,answers:Attempt[],through?:number){
    const latest=through??answers.at(-1)?.sequence??0
    if(!latest)return null
    if(session.mode!=='guided')return this.feedback(version,citation)
    if(through===1)return null
    if(this.solutionReveal(db,session.id,version.id))return this.feedback(version,citation)
    const hinted=new Set(this.hints(db,session.id,version.id).map(hint=>hint.for_sequence))
    return answers.some(row=>row.sequence<=latest&&row.sequence>1&&row.grading_state==='correct'&&hinted.has(row.sequence))
      ? this.feedback(version,citation) : null
  }

  reveal(prior:SessionActor,key:string,id:string,versionId:string){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),session=this.practice(db,actor,id)
      const target=this.inSession(db,actor,id,now).find(item=>item.version.id===versionId)
      if(!target)throw missingQuestion()
      if(session.mode!=='guided')throw new AssetError(404,'NOT_FOUND')
      const answer=this.attempts(db,id,versionId).at(-1)
      if(!answer)throw new AssetError(409,'FIRST_ANSWER_REQUIRED')
      const old=db.prepare('SELECT session_id,question_version_id FROM practice_solution_reveals WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId,actor.userId,key)
      if(old&&(old.session_id!==id||old.question_version_id!==versionId))throw conflict()
      const previous=this.solutionReveal(db,id,versionId)
      if(!previous)db.prepare('INSERT INTO practice_solution_reveals VALUES(?,?,?,?,?,?,?)')
        .run(actor.serviceId,actor.userId,id,versionId,answer.sequence,key,now)
      return {feedback:this.feedback(target.version,target.citation),replayed:!!previous}
    })
  }

  private transfer(db:DatabaseSync,actor:SessionActor,id:string){
    const row=db.prepare('SELECT * FROM practice_transfers WHERE id=? AND service_id=? AND user_id=?')
      .get(id,actor.serviceId,actor.userId) as unknown as Transfer|undefined
    if(!row)throw missingPractice()
    return row
  }

  private compareTransfer(db:DatabaseSync,actor:SessionActor,source:string,destination:string,now:string){
    const first=this.accessVersion(db,actor,source,now),next=this.accessVersion(db,actor,destination,now)
    const a=first.version,b=next.version
    if(a.id!==first.question.current_version_id||b.id!==next.question.current_version_id)return 'QUESTION_VERSION_CHANGED'
    if(this.openDispute(db,a.id)||this.openDispute(db,b.id))return 'TRANSFER_QUESTION_DISPUTED'
    if(this.quickQuestion(db,a.id)||this.quickQuestion(db,b.id))return 'TRANSFER_NEEDS_REVIEWED_SOURCE'
    if(a.kind!==b.kind||a.difficulty!==b.difficulty)return 'TRANSFER_NOT_COMPARABLE'
    if(first.question.id===next.question.id||first.citation.quote_hash===next.citation.quote_hash||normalizeFill(a.prompt)===normalizeFill(b.prompt))
      return 'TRANSFER_CONTEXT_REQUIRED'
    if(next.question.author_id===actor.userId)return 'TRANSFER_PRIOR_EXPOSURE'
    return null
  }

  private transferExposure(db:DatabaseSync,actor:SessionActor,versionId:string,allowedSession:string|null,observed?:Attempt){
    const q=this.version(db,versionId)
    const attempted=db.prepare(`SELECT 1 FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
      WHERE a.service_id=? AND a.user_id=? AND v.question_id=? AND (? IS NULL OR a.session_id<>?)
        AND (? IS NULL OR a.rowid<(SELECT rowid FROM practice_attempts WHERE id=?)) LIMIT 1`)
      .get(actor.serviceId,actor.userId,q.question_id,allowedSession,allowedSession,observed?.id??null,observed?.id??null)
    const aided=db.prepare(`SELECT 1 FROM practice_hint_events h JOIN question_versions v ON v.id=h.question_version_id
      WHERE h.service_id=? AND h.user_id=? AND v.question_id=? AND (? IS NULL OR h.requested_at<?) LIMIT 1`)
      .get(actor.serviceId,actor.userId,q.question_id,observed?.submitted_at??null,observed?.submitted_at??null)
    return !!(attempted||aided)
  }

  private transferView(db:DatabaseSync,actor:SessionActor,row:Transfer,now:string){
    let limit=this.compareTransfer(db,actor,row.source_version_id,row.target_version_id,now)
    const attempt=row.started_session_id?this.attempts(db,row.started_session_id,row.target_version_id)[0]:undefined
    if(!limit&&this.transferExposure(db,actor,row.target_version_id,row.started_session_id,attempt))limit='TRANSFER_PRIOR_EXPOSURE'
    if(!limit&&attempt&&(!attempt.independent||attempt.confidence!=='sure'||attempt.grading_state==='disputed'))limit='TRANSFER_RESULT_INSUFFICIENT'
    const eligible=!!attempt&&!limit&&attempt.grading_state==='correct'
    const primary=this.version(db,row.source_version_id),target=this.version(db,row.target_version_id)
    const prior=this.attempts(db,row.source_session_id,row.source_version_id)
    const observe=(answer:Attempt|undefined)=>answer?{sequence:answer.sequence,grading_state:answer.grading_state,independent:answer.independent===1,submitted_at:answer.submitted_at}:null
    return {id:row.id,primary_session_id:row.source_session_id,target_version_id:row.target_version_id,
      first_attempt_id:row.first_attempt_id,guided_attempt_id:row.guided_attempt_id,transfer_attempt_id:attempt?.id??null,
      available_at:row.available_at,started_at:row.started_at,started_session_id:row.started_session_id,
      status:limit?'limited':attempt?'observed':row.started_session_id?'started':row.available_at<=now?'ready':'scheduled',
      evidence_state:eligible?'independent_transfer_supported':attempt&&!limit?'not_demonstrated':'insufficient',
      limit_reason:limit,evaluation_eligible:eligible,difficulty:target.difficulty,source_title:primary.prompt,target_title:target.prompt,
      first_observation:observe(prior.find(item=>item.id===row.first_attempt_id)),
      guided_observation:observe(prior.find(item=>item.id===row.guided_attempt_id)),
      transfer_observation:observe(attempt)}
  }

  listTransfers(prior:SessionActor){
    return this.tx('read',(db,now)=>{
      const actor=this.actor(prior,now)
      const rows=db.prepare('SELECT * FROM practice_transfers WHERE service_id=? AND user_id=? ORDER BY available_at,id')
        .all(actor.serviceId,actor.userId) as unknown as Transfer[]
      const items=rows.flatMap(row=>{
        try{return [this.transferView(db,actor,row,now)]}
        catch(error){if(error instanceof AssetError&&error.status===404)return [];throw error}
      })
      return {items,server_time:now}
    })
  }

  scheduleTransfer(prior:SessionActor,key:string,input:TransferDraft){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),digest=hash(input)
      const old=db.prepare('SELECT * FROM practice_transfers WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId,actor.userId,key) as unknown as Transfer|undefined
      if(old){
        const view=this.transferView(db,actor,old,now)
        if(old.request_digest!==digest)throw conflict()
        return {transfer:view,replayed:true}
      }
      const session=this.practice(db,actor,input.primary_session_id)
      const range=this.inSession(db,actor,session.id,now)
      if(session.mode!=='guided'||range.length!==1)throw new AssetError(409,'TRANSFER_NEEDS_GUIDED_PRACTICE')
      const version=range[0]!.version
      const comparison=this.compareTransfer(db,actor,version.id,input.target_version_id,now)
      if(comparison)throw new AssetError(409,comparison)
      if(this.transferExposure(db,actor,input.target_version_id,null))throw new AssetError(409,'TRANSFER_PRIOR_EXPOSURE')
      if(input.available_at<=now)throw new AssetError(422,'TRANSFER_DELAY_REQUIRED')
      const answers=this.attempts(db,session.id,version.id),first=answers[0]
      const hinted=new Set(this.hints(db,session.id,version.id).map(hint=>hint.for_sequence))
      const reveal=this.solutionReveal(db,session.id,version.id)
      const guided=answers.find(row=>row.sequence>1&&!row.independent&&row.grading_state==='correct'&&hinted.has(row.sequence)&&
        (!reveal||Number(reveal.after_sequence)>=row.sequence))
      if(!first||!first.independent||first.grading_state!=='incorrect'||!guided)throw new AssetError(409,'TRANSFER_EVIDENCE_INSUFFICIENT')
      const duplicate=db.prepare('SELECT 1 FROM practice_transfers WHERE source_session_id=? AND target_version_id=?').get(session.id,input.target_version_id)
      if(duplicate)throw new AssetError(409,'TRANSFER_ALREADY_PLANNED')
      const id=randomUUID()
      db.prepare(`INSERT INTO practice_transfers
        (id,service_id,user_id,source_session_id,source_version_id,first_attempt_id,guided_attempt_id,target_version_id,available_at,created_at,request_key,request_digest)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,actor.serviceId,actor.userId,session.id,version.id,first.id,guided.id,input.target_version_id,input.available_at,now,key,digest)
      return {transfer:this.transferView(db,actor,this.transfer(db,actor,id),now),replayed:false}
    })
  }

  startTransfer(prior:SessionActor,key:string,id:string){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),row=this.transfer(db,actor,id),view=this.transferView(db,actor,row,now)
      const reused=db.prepare('SELECT id FROM practice_transfers WHERE service_id=? AND user_id=? AND start_key=?').get(actor.serviceId,actor.userId,key)
      if(reused&&reused.id!==id)throw conflict()
      if(view.limit_reason)throw new AssetError(409,view.limit_reason)
      if(row.started_session_id)return {session:this.session(db,this.practice(db,actor,row.started_session_id)),transfer:view,replayed:true}
      if(row.available_at>now)throw new AssetError(409,'TRANSFER_NOT_DUE')
      const session=this.insertSession(db,actor,now,randomUUID(),hash([id,'transfer']),[row.target_version_id],'transfer')
      if(Number(db.prepare('UPDATE practice_transfers SET started_session_id=?,start_key=?,started_at=? WHERE id=? AND started_session_id IS NULL')
        .run(session.id,key,now,id).changes)!==1)throw new AssetError(409,'REVISION_CONFLICT')
      return {session:this.session(db,session),transfer:this.transferView(db,actor,this.transfer(db,actor,id),now),replayed:false}
    })
  }

  dispute(prior:SessionActor,key:string,sessionId:string,versionId:string,reason:string){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),practice=this.practice(db,actor,sessionId)
      const target=this.inSession(db,actor,practice.id,now).find(item=>item.version.id===versionId)
      if(!target)throw missingQuestion()
      const old=db.prepare(`SELECT d.id,d.question_version_id,d.reason,a.session_id FROM practice_disputes d
        JOIN practice_attempts a ON a.id=d.attempt_id WHERE d.service_id=? AND d.user_id=? AND d.request_key=?`)
        .get(actor.serviceId,actor.userId,key)
      const isCurrent=target.question.current_version_id===versionId
      if(old){
        if(old.question_version_id!==versionId||old.session_id!==sessionId||old.reason!==reason)throw conflict()
        return {dispute:{id:String(old.id),status:isCurrent?'open':'resolved',question_version_id:versionId},replayed:true}
      }
      if(!isCurrent)throw new AssetError(409,'QUESTION_VERSION_CHANGED')
      const attempt=this.attempts(db,sessionId,versionId)[0]
      if(!attempt)throw new AssetError(409,'FIRST_ANSWER_REQUIRED')
      const priorReport=db.prepare('SELECT 1 FROM practice_disputes WHERE service_id=? AND user_id=? AND question_version_id=?')
        .get(actor.serviceId,actor.userId,versionId)
      if(priorReport)throw new AssetError(409,'DISPUTE_ALREADY_OPEN')
      const id=randomUUID()
      db.prepare('INSERT INTO practice_disputes VALUES(?,?,?,?,?,?,?,?)')
        .run(id,actor.serviceId,actor.userId,attempt.id,versionId,reason,key,now)
      return {dispute:{id,status:'open',question_version_id:versionId},replayed:false}
    })
  }

  private correctedAnswers(version:Version,answer:CorrectionInput['answer']){
    let answers:Answer[]
    if(version.kind==='fill'){
      if(!Array.isArray(answer)||!answer.length||answer.length>12||answer.some(value=>typeof value!=='string'||!normalizeFill(value)))
        throw new AssetError(422,'INVALID_PRACTICE_ANSWER')
      answers=answer.map(value=>String(value).trim())
      if(new Set(answers.map(value=>normalizeFill(String(value)))).size!==answers.length)throw new AssetError(422,'INVALID_PRACTICE_ANSWER')
    }else{
      const options=JSON.parse(version.options_json) as string[]
      if(version.kind==='judgment'?typeof answer!=='boolean':typeof answer!=='number'||!Number.isInteger(answer)||answer<1||answer>options.length)
        throw new AssetError(422,'INVALID_PRACTICE_ANSWER')
      answers=[answer as Answer]
    }
    return answers
  }

  correct(prior:SessionActor,key:string,id:string,input:CorrectionInput){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),{question,version,citation}=this.authorQuestion(db,actor,id,now)
      const digest=hash([id,input])
      const previous=db.prepare('SELECT * FROM question_corrections WHERE author_id=? AND request_key=?').get(actor.userId,key)
      const correctionView=(entry:Record<string,unknown>)=>({id:String(entry.id),from_version_id:String(entry.from_version_id),
        to_version_id:String(entry.to_version_id),reason:String(entry.reason),created_at:String(entry.created_at)})
      if(previous){
        if(previous.question_id!==id||previous.request_digest!==digest)throw conflict()
        const fixed=this.accessVersion(db,actor,String(previous.to_version_id),now)
        return {question:this.learner(db,fixed.question,fixed.version),correction:correctionView(previous),replayed:true}
      }
      if(input.expected_version!==version.version||version.version>=Number.MAX_SAFE_INTEGER)throw new AssetError(409,'QUESTION_VERSION_CHANGED')
      const answers=this.correctedAnswers(version,input.answer)
      const next=randomUUID(),correctionId=randomUUID()
      db.prepare(`INSERT INTO question_versions
        (id,question_id,version,kind,prompt,options_json,answers_json,explanation,evidence_json,citation_id,grading_rule,created_by,created_at,difficulty)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(next,id,version.version+1,version.kind,version.prompt,version.options_json,JSON.stringify(answers),
          input.explanation,version.evidence_json,citation.id,version.grading_rule,actor.userId,now,version.difficulty)
      db.prepare('INSERT INTO question_corrections VALUES(?,?,?,?,?,?,?,?,?)')
        .run(correctionId,id,version.id,next,actor.userId,input.reason,key,digest,now)
      const affected=db.prepare(`SELECT a.id,a.answer_json FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
        WHERE v.question_id=? AND a.service_id=?`).all(id,actor.serviceId)
      const add=db.prepare('INSERT INTO practice_attempt_regrades VALUES(?,?,?,?,?)')
      for(const row of affected)add.run(String(row.id),next,correctionId,scoreAnswer(version.kind,JSON.parse(String(row.answer_json)) as Answer,answers),now)
      if(Number(db.prepare('UPDATE questions SET current_version_id=? WHERE id=? AND current_version_id=?').run(next,id,version.id).changes)!==1)
        throw new AssetError(409,'QUESTION_VERSION_CHANGED')
      const updated={...question,current_version_id:next}
      return {question:this.learner(db,updated,this.version(db,next)),correction:correctionView({id:correctionId,from_version_id:version.id,
        to_version_id:next,reason:input.reason,created_at:now}),replayed:false}
    })
  }

  private evaluation(db:DatabaseSync,actor:SessionActor,question:Question,version:Version,row:Attempt,now:string){
    const corrected=question.current_version_id!==version.id
    let effective:GradingState|null=row.grading_state
    if(corrected){
      try {
        this.accessVersion(db,actor,question.current_version_id,now)
        const revised=db.prepare('SELECT grading_state FROM practice_attempt_regrades WHERE attempt_id=? AND corrected_version_id=?')
          .get(row.id,question.current_version_id)
        effective=(revised?.grading_state as GradingState|undefined)??null
      }catch(error){if(error instanceof AssetError&&error.status===404)effective=null;else throw error}
    }
    const trial=db.prepare('SELECT id FROM practice_transfers WHERE started_session_id=? AND service_id=? AND user_id=?')
      .get(row.session_id,actor.serviceId,actor.userId)
    let transferable=true
    let transferLimited=false
    if(trial){
      try{
        const result=this.transferView(db,actor,this.transfer(db,actor,String(trial.id)),now)
        transferable=result.evaluation_eligible&&result.transfer_attempt_id===row.id
        transferLimited=Boolean(result.limit_reason)
      }catch(error){if(error instanceof AssetError&&error.status===404){transferable=false;transferLimited=true}else throw error}
    }
    const paused=effective===null||effective==='disputed'||this.openDispute(db,question.current_version_id)||transferLimited
    const confident=row.confidence==='sure', independent=row.independent===1
    return {classification:classifyPractice(effective,paused,independent,confident),original_grading:row.grading_state,
      effective_grading:effective,evaluation_status:paused?'paused':corrected?'corrected':'recorded',
      evaluation_eligible:!this.quickQuestion(db,version.id)&&!paused&&independent&&confident&&transferable}
  }

  private personalState(db:DatabaseSync,actor:SessionActor,questionId:string):PersonalState{
    return (db.prepare('SELECT revision,wrong_reason,mastery_state,next_review_at,updated_at FROM personal_question_states WHERE service_id=? AND user_id=? AND question_id=?')
      .get(actor.serviceId,actor.userId,questionId) as unknown as PersonalState|undefined) ?? initialState
  }

  review(prior:SessionActor){
    return this.tx('read',(db,now)=>{
      const actor=this.actor(prior,now)
      const attempts=db.prepare(`SELECT a.*,v.question_id FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
        WHERE a.service_id=? AND a.user_id=? ORDER BY a.submitted_at,a.rowid`).all(actor.serviceId,actor.userId) as unknown as (Attempt&{question_id:string})[]
      const seen=new Set<string>()
      const items=attempts.flatMap(row=>{
        if(seen.has(row.question_id))return []
        try {
          const {question,version}=this.accessVersion(db,actor,row.question_version_id,now)
          seen.add(question.id)
          const evaluation=this.evaluation(db,actor,question,version,row,now)
          return [{question:this.learner(db,question,version),attempt:{...this.attempt(row,!!this.quickQuestion(db,version.id)),...evaluation},
            session_id:row.session_id,...evaluation,state:this.personalState(db,actor,question.id)}]
        }catch(error){if(error instanceof AssetError&&error.status===404)return [];throw error}
      })
      const review_queue=items.filter(item=>item.state.next_review_at&&item.classification!=='disputed')
        .map(item=>({question_id:item.question.id,title:item.question.prompt,next_review_at:item.state.next_review_at!,session_id:item.session_id}))
        .sort((left,right)=>left.next_review_at.localeCompare(right.next_review_at))
      return {items,review_queue}
    })
  }

  updateReview(prior:SessionActor,key:string,id:string,input:ReviewDraft){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now),digest=hash([id,input])
      const row=db.prepare(`SELECT a.question_version_id FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
        WHERE a.service_id=? AND a.user_id=? AND v.question_id=? ORDER BY a.submitted_at,a.rowid LIMIT 1`).get(actor.serviceId,actor.userId,id)
      if(!row)throw missingQuestion()
      this.accessVersion(db,actor,String(row.question_version_id),now)
      const old=db.prepare('SELECT question_id,digest,result_json FROM personal_question_receipts WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId,actor.userId,key)
      if(old){
        if(old.question_id!==id||old.digest!==digest)throw conflict()
        return {state:JSON.parse(String(old.result_json)) as PersonalState,replayed:true}
      }
      const currentState=this.personalState(db,actor,id)
      if(input.expected_revision!==currentState.revision||currentState.revision>=Number.MAX_SAFE_INTEGER)throw new AssetError(409,'REVISION_CONFLICT')
      const {expected_revision, ...values}=input
      const state={...currentState,...values,revision:expected_revision+1,updated_at:now}
      db.prepare(`INSERT INTO personal_question_states VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(service_id,user_id,question_id) DO UPDATE SET revision=excluded.revision,wrong_reason=excluded.wrong_reason,
        mastery_state=excluded.mastery_state,next_review_at=excluded.next_review_at,updated_at=excluded.updated_at`)
        .run(actor.serviceId,actor.userId,id,state.revision,state.wrong_reason,state.mastery_state,state.next_review_at,now)
      db.prepare('INSERT INTO personal_question_receipts VALUES(?,?,?,?,?,?)')
        .run(actor.serviceId,actor.userId,key,id,digest,JSON.stringify(state))
      return {state,replayed:false}
    })
  }

  checkQuick(prior:SessionActor,pinned:QuickRange){
    return this.tx('read',(db,now)=>this.checkQuickSources(db,this.actor(prior,now),pinned,now))
  }

  private replayQuick(db:DatabaseSync,actor:SessionActor,key:string,pinned:QuickRange,now:string){
    const run=db.prepare('SELECT fingerprint,session_id,coverage_json FROM quick_practice_runs WHERE service_id=? AND user_id=? AND request_key=?')
      .get(actor.serviceId,actor.userId,key)
    if(!run)return
    if(run.fingerprint!==pinned.fingerprint)throw conflict()
    const coverage=JSON.parse(String(run.coverage_json)) as QuickCoverage
    if(!run.session_id)return {status:'insufficient',coverage,replayed:true} as const
    const session=this.practice(db,actor,String(run.session_id))
    this.inSession(db,actor,session.id,now)
    return {status:'ready',session:this.session(db,session),coverage,replayed:true} as const
  }

  quickReplay(prior:SessionActor,key:string,pinned:QuickRange){
    return this.tx('read',(db,now)=>{
      const actor=this.actor(prior,now)
      this.checkQuickSources(db,actor,pinned,now)
      return this.replayQuick(db,actor,key,pinned,now)
    })
  }

  saveQuick(prior:SessionActor,key:string,pinned:QuickRange,generated:GeneratedQuestion[],model?:{provider:string;model:string}){
    return this.tx('write',(db,now)=>{
      const actor=this.actor(prior,now)
      this.checkQuickSources(db,actor,pinned,now)
      const old=this.replayQuick(db,actor,key,pinned,now)
      if(old)return old
      if(generated.length&&!model)throw new AssetError(503,'PRACTICE_UNAVAILABLE')
      const coverage={...pinned.coverage}
      const insertRun=(id:string|null)=>db.prepare('INSERT INTO quick_practice_runs VALUES(?,?,?,?,?,?,?,?,?)')
        .run(actor.serviceId,actor.userId,key,pinned.fingerprint,id,JSON.stringify(coverage),model?.provider??null,model?.model??null,now)
      if(!generated.length){insertRun(null);return {status:'insufficient',coverage,replayed:false} as const}
      const pin=(item:GeneratedQuestion['source'])=>{
        const {data}=this.citations.createPinned(db,actor,item.spec,randomUUID(),now,item.witness)
        return this.citations.knowledgeSource(db,actor,data.id,now)
      }
      if(pinned.anchor){
        const citation=pin(pinned.anchor)
        coverage.return_href='/knowledgeos/reader?'+new URLSearchParams({asset:citation.asset_id,version:citation.version_id,citation:citation.id})
      }
      const ids=generated.map(item=>{
        const citation=pin(item.source)
        const draft:QuestionDraft={kind:'choice',prompt:item.prompt,options:item.options,accepted:[item.answer],explanation:item.explanation,project_id:null,source_citation_id:citation.id}
        return this.insertQuestion(db,actor,now,randomUUID(),hash(draft),draft,citation).current_version_id
      })
      const session=this.insertSession(db,actor,now,randomUUID(),pinned.fingerprint,ids)
      insertRun(session.id)
      const metadata=db.prepare('INSERT INTO quick_practice_questions VALUES(?,?,?)')
      ids.forEach((id,i)=>metadata.run(id,session.id,generated[i]!.quality))
      return {status:'ready',session:this.session(db,session),coverage,replayed:false} as const
    })
  }

  private attempt(row: Attempt,generated:boolean) {
    return { id: row.id, question_version_id: row.question_version_id, sequence: row.sequence,
      answer: JSON.parse(row.answer_json) as Answer, confidence: row.confidence, grading_state: row.grading_state,
      independent: row.independent === 1, submitted_at: row.submitted_at,
      evaluation_eligible:!generated&&row.independent===1&&row.confidence==='sure'&&row.grading_state!=='disputed' }
  }

  private attempts(db: DatabaseSync, session: string, version: string) {
    return db.prepare('SELECT * FROM practice_attempts WHERE session_id=? AND question_version_id=? ORDER BY sequence')
      .all(session, version) as unknown as Attempt[]
  }

  questions(prior: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now), practice = this.practice(db, actor, id)
      const questions = this.inSession(db, actor, practice.id, now).map(({ question, version, citation }) => {
        const attempts = this.attempts(db, id, version.id)
        const view=this.learner(db,question,version)
        return { ...view, attempts: attempts.map(row => ({...this.attempt(row,view.origin_kind==='generated'),
            ...this.evaluation(db,actor,question,version,row,now)})),
          hints:this.hints(db,id,version.id),feedback:this.visibleFeedback(db,practice,version,citation,attempts) }
      })
      return { session: this.session(db,practice), questions }
    })
  }

  submit(prior: SessionActor, key: string, id: string, input: AttemptInput) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), practice = this.practice(db, actor, id)
      const authorized = this.inSession(db, actor, practice.id, now).find(item => item.version.id === input.question_version_id)
      if (!authorized) throw missingQuestion()
      const { question, version, citation } = authorized
      const generated=Boolean(this.quickQuestion(db,version.id))
      if(practice.mode==='transfer'){
        const ref=db.prepare('SELECT id FROM practice_transfers WHERE started_session_id=? AND service_id=? AND user_id=?').get(id,actor.serviceId,actor.userId)
        if(!ref)throw missingPractice()
        const evaluation=this.transferView(db,actor,this.transfer(db,actor,String(ref.id)),now)
        if(evaluation.limit_reason)throw new AssetError(409,evaluation.limit_reason)
      }
      const digest = hash([id, input])
      const priorReceipt = db.prepare('SELECT attempt_id,digest FROM practice_attempt_receipts WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key)
      if (priorReceipt) {
        if (priorReceipt.digest !== digest) throw conflict()
        const old = db.prepare('SELECT * FROM practice_attempts WHERE id=? AND session_id=? AND service_id=? AND user_id=? AND question_version_id=?')
          .get(String(priorReceipt.attempt_id), id, actor.serviceId, actor.userId, version.id) as unknown as Attempt | undefined
        if (!old) throw missingPractice()
        return { attempt:{...this.attempt(old,generated),...this.evaluation(db,actor,question,version,old,now)},
          feedback:this.visibleFeedback(db,practice,version,citation,this.attempts(db,id,version.id),old.sequence),replayed:true }
      }
      const { answer, confidence } = input
      if (version.kind === 'choice' && (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 1 || answer > (JSON.parse(version.options_json) as string[]).length) ||
          version.kind === 'judgment' && typeof answer !== 'boolean' ||
          version.kind === 'fill' && (typeof answer !== 'string' || !normalizeFill(answer)))
        throw new AssetError(422, 'INVALID_PRACTICE_ANSWER')
      const last = db.prepare('SELECT max(sequence) AS last FROM practice_attempts WHERE session_id=? AND question_version_id=?').get(id, version.id)
      const sequence = Number(last?.last ?? 0)
      if (sequence !== input.expected_sequence || sequence >= Number.MAX_SAFE_INTEGER) throw new AssetError(409, 'ATTEMPT_SEQUENCE_CONFLICT')
      const exposure=db.prepare(`SELECT 1 FROM practice_attempts a JOIN question_versions v ON v.id=a.question_version_id
        WHERE a.service_id=? AND a.user_id=? AND v.question_id=? LIMIT 1`).get(actor.serviceId,actor.userId,question.id)
      const assisted=this.hints(db,id,version.id).some(hint=>hint.for_sequence===sequence+1)
      const accepted = JSON.parse(version.answers_json) as Answer[]
      const row: Attempt = { id: randomUUID(), session_id: id, question_version_id: version.id, sequence: sequence + 1,
        submitted_at: now, answer_json: JSON.stringify(answer), confidence, grading_state: scoreAnswer(version.kind, answer, accepted),
        independent:!exposure&&!assisted&&(generated||question.author_id!==actor.userId)?1:0 }
      db.prepare('INSERT INTO practice_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(row.id, id, version.id, actor.serviceId, actor.userId,
        row.sequence, row.answer_json, confidence, row.grading_state, row.independent, now)
      if(question.current_version_id!==version.id){
        const current=this.accessVersion(db,actor,question.current_version_id,now).version
        const correction=db.prepare('SELECT id FROM question_corrections WHERE to_version_id=?').get(current.id)
        if(!correction)throw new AssetError(409,'QUESTION_VERSION_CHANGED')
        db.prepare('INSERT INTO practice_attempt_regrades VALUES(?,?,?,?,?)').run(row.id,current.id,String(correction.id),
          scoreAnswer(current.kind,answer,JSON.parse(current.answers_json) as Answer[]),now)
      }
      db.prepare('INSERT INTO practice_attempt_receipts VALUES(?,?,?,?,?)').run(actor.serviceId, actor.userId, key, digest, row.id)
      return {attempt:{...this.attempt(row,generated),...this.evaluation(db,actor,question,version,row,now)},
        feedback:this.visibleFeedback(db,practice,version,citation,this.attempts(db,id,version.id),row.sequence),replayed:false}
    })
  }
}
