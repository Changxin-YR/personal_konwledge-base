import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { CitationStore } from './citation-store.ts'
import type { SessionActor } from './identity.ts'
import type { ParseTx } from './parse-store.ts'
import { exactRule, fillRule, normalizeFill, scoreAnswer, type Answer, type Confidence, type GradingState, type QuestionKind } from './practice-policy.ts'

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

export interface QuestionDraft {
  kind: QuestionKind; prompt: string; options: string[]; accepted: Answer[]; explanation: string
  source_citation_id: string; project_id: string | null
}
export interface AttemptInput { question_version_id: string; expected_sequence: number; answer: Answer; confidence: Confidence }
type Citation = ReturnType<CitationStore['knowledgeSource']>
interface Question { id: string; author_id: string; project_id: string | null; current_version_id: string; request_digest: string }
interface Version {
  id: string; question_id: string; version: number; kind: QuestionKind; prompt: string; options_json: string
  answers_json: string; explanation: string; evidence_json: string; citation_id: string; grading_rule: string
}
interface Practice { id: string; started_at: string; request_digest: string }
interface Attempt {
  id: string; session_id: string; question_version_id: string; sequence: number; answer_json: string
  confidence: Confidence; grading_state: GradingState; independent: number; submitted_at: string
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const missingQuestion = () => new AssetError(404, 'QUESTION_NOT_FOUND')
const missingPractice = () => new AssetError(404, 'PRACTICE_NOT_FOUND')
const conflict = () => new AssetError(409, 'IDEMPOTENCY_CONFLICT')
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

  private learner(question: Question, version: Version) {
    return { id: question.id, version_id: version.id, version: version.version, kind: version.kind, prompt: version.prompt,
      options: JSON.parse(version.options_json) as string[], project_id: question.project_id, author_id: question.author_id }
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
        try { this.source(db, actor, version, now); return [this.learner(question, version)] }
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
      const row = db.prepare('SELECT current_version_id FROM questions WHERE id=? AND service_id=? AND author_id=?').get(id, actor.serviceId, actor.userId)
      if (!row) throw missingQuestion()
      const { question, version, citation } = this.accessVersion(db, actor, String(row.current_version_id), now)
      return { question: this.learner(question, version), feedback: this.feedback(version, citation) }
    })
  }

  createQuestion(prior: SessionActor, key: string, draft: QuestionDraft) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), digest = hash(draft)
      const old = db.prepare('SELECT * FROM questions WHERE service_id=? AND author_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key) as unknown as Question | undefined
      if (old) {
        const { question, version } = this.accessVersion(db, actor, old.current_version_id, now)
        if (old.request_digest !== digest) throw conflict()
        return { question: this.learner(question, version), replayed: true }
      }
      if (draft.project_id && !this.canUseProject(actor, draft.project_id, now)) throw missingQuestion()
      const citation = this.citations.knowledgeSource(db, actor, draft.source_citation_id, now)
      const id = randomUUID(), versionId = randomUUID()
      db.prepare('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?)')
        .run(id, actor.serviceId, actor.userId, draft.project_id, versionId, now, key, digest)
      db.prepare(`INSERT INTO question_versions
        (id,question_id,version,kind,prompt,options_json,answers_json,explanation,evidence_json,citation_id,grading_rule,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        versionId, id, 1, draft.kind, draft.prompt, JSON.stringify(draft.options), JSON.stringify(draft.accepted), draft.explanation,
        JSON.stringify(citation), citation.id, draft.kind === 'fill' ? fillRule : exactRule, actor.userId, now)
      const question = { id, author_id: actor.userId, project_id: draft.project_id, current_version_id: versionId, request_digest: digest }
      return { question: this.learner(question, this.version(db, versionId)), replayed: false }
    })
  }

  private practice(db: DatabaseSync, actor: SessionActor, id: string) {
    const row = db.prepare('SELECT id,started_at,request_digest FROM practice_sessions WHERE id=? AND service_id=? AND user_id=?')
      .get(id, actor.serviceId, actor.userId) as unknown as Practice | undefined
    if (!row) throw missingPractice()
    return row
  }

  private inSession(db: DatabaseSync, actor: SessionActor, id: string, now: string) {
    return db.prepare('SELECT question_version_id FROM practice_session_questions WHERE session_id=? ORDER BY position')
      .all(id).map(row => this.accessVersion(db, actor, String(row.question_version_id), now))
  }

  private session(row: Practice) {
    return { id: row.id, started_at: row.started_at }
  }

  listSessions(prior: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const rows = db.prepare('SELECT id,started_at,request_digest FROM practice_sessions WHERE service_id=? AND user_id=? ORDER BY started_at DESC,id')
        .all(actor.serviceId, actor.userId) as unknown as Practice[]
      return rows.flatMap(row => {
        try {
          const questions = this.inSession(db, actor, row.id, now)
          return [{ ...this.session(row), count: questions.length, title: questions[0]?.version.prompt }]
        } catch (error) { if (error instanceof AssetError && error.status === 404) return []; throw error }
      })
    })
  }

  createSession(prior: SessionActor, key: string, versions: string[]) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), digest = hash(versions)
      const old = db.prepare('SELECT id,started_at,request_digest FROM practice_sessions WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key) as unknown as Practice | undefined
      if (old) {
        this.inSession(db, actor, old.id, now)
        if (old.request_digest !== digest) throw conflict()
        return { session: this.session(old), replayed: true }
      }
      for (const id of versions) this.accessVersion(db, actor, id, now)
      const id = randomUUID()
      db.prepare('INSERT INTO practice_sessions VALUES(?,?,?,?,?,?)').run(id, actor.serviceId, actor.userId, now, key, digest)
      const add = db.prepare('INSERT INTO practice_session_questions VALUES(?,?,?)')
      versions.forEach((version, i) => add.run(id, version, i))
      return { session: this.session({ id, started_at: now, request_digest: digest }), replayed: false }
    })
  }

  private attempt(row: Attempt) {
    return { id: row.id, question_version_id: row.question_version_id, sequence: row.sequence,
      answer: JSON.parse(row.answer_json) as Answer, confidence: row.confidence, grading_state: row.grading_state,
      independent: row.independent === 1, submitted_at: row.submitted_at }
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
        return { ...this.learner(question, version), attempts: attempts.map(row => this.attempt(row)),
          feedback: attempts.length ? this.feedback(version, citation) : null }
      })
      return { session: this.session(practice), questions }
    })
  }

  submit(prior: SessionActor, key: string, id: string, input: AttemptInput) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), practice = this.practice(db, actor, id)
      const authorized = this.inSession(db, actor, practice.id, now).find(item => item.version.id === input.question_version_id)
      if (!authorized) throw missingQuestion()
      const { question, version, citation } = authorized
      const digest = hash([id, input])
      const priorReceipt = db.prepare('SELECT attempt_id,digest FROM practice_attempt_receipts WHERE service_id=? AND user_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key)
      if (priorReceipt) {
        if (priorReceipt.digest !== digest) throw conflict()
        const old = db.prepare('SELECT * FROM practice_attempts WHERE id=? AND session_id=? AND service_id=? AND user_id=? AND question_version_id=?')
          .get(String(priorReceipt.attempt_id), id, actor.serviceId, actor.userId, version.id) as unknown as Attempt | undefined
        if (!old) throw missingPractice()
        return { attempt: this.attempt(old), feedback: this.feedback(version, citation), replayed: true }
      }
      const { answer, confidence } = input
      if (version.kind === 'choice' && (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 1 || answer > (JSON.parse(version.options_json) as string[]).length) ||
          version.kind === 'judgment' && typeof answer !== 'boolean' ||
          version.kind === 'fill' && (typeof answer !== 'string' || !normalizeFill(answer)))
        throw new AssetError(422, 'INVALID_PRACTICE_ANSWER')
      const last = db.prepare('SELECT max(sequence) AS last FROM practice_attempts WHERE session_id=? AND question_version_id=?').get(id, version.id)
      const sequence = Number(last?.last ?? 0)
      if (sequence !== input.expected_sequence || sequence >= Number.MAX_SAFE_INTEGER) throw new AssetError(409, 'ATTEMPT_SEQUENCE_CONFLICT')
      const exposure = db.prepare('SELECT 1 FROM practice_attempts WHERE service_id=? AND user_id=? AND question_version_id=? LIMIT 1')
        .get(actor.serviceId, actor.userId, version.id)
      const accepted = JSON.parse(version.answers_json) as Answer[]
      const row: Attempt = { id: randomUUID(), session_id: id, question_version_id: version.id, sequence: sequence + 1,
        submitted_at: now, answer_json: JSON.stringify(answer), confidence, grading_state: scoreAnswer(version.kind, answer, accepted),
        independent: !exposure && question.author_id !== actor.userId ? 1 : 0 }
      db.prepare('INSERT INTO practice_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(row.id, id, version.id, actor.serviceId, actor.userId,
        row.sequence, row.answer_json, confidence, row.grading_state, row.independent, now)
      db.prepare('INSERT INTO practice_attempt_receipts VALUES(?,?,?,?,?)').run(actor.serviceId, actor.userId, key, digest, row.id)
      return { attempt: this.attempt(row), feedback: this.feedback(version, citation), replayed: false }
    })
  }
}
