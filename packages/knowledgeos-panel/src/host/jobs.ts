import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { SessionActor } from './identity.ts'

export const JOB_SCHEMA = `CREATE TABLE jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
  object_id TEXT NOT NULL REFERENCES knowledge_objects(id), expected_revision INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0,
  checkpoint INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint IN (0,1)), lease_token TEXT UNIQUE, lease_until INTEGER,
  available_at INTEGER NOT NULL, last_error TEXT, UNIQUE(user_id,idempotency_key),
  CHECK((state='running')=(lease_token IS NOT NULL)), CHECK((state='running')=(lease_until IS NOT NULL))
) STRICT;
CREATE INDEX jobs_ready ON jobs(state,available_at);
CREATE TABLE job_runs (job_id TEXT NOT NULL REFERENCES jobs(id), attempt INTEGER NOT NULL, worker TEXT NOT NULL,
  started_at INTEGER NOT NULL, start_checkpoint INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, PRIMARY KEY(job_id,attempt)) STRICT;
CREATE TABLE job_results (job_id TEXT PRIMARY KEY REFERENCES jobs(id), input_revision INTEGER NOT NULL) STRICT;
CREATE TABLE outbox (event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES job_results(job_id), created_at INTEGER NOT NULL,
  delivered_at INTEGER, failures INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT) STRICT;
CREATE TABLE event_receipts (consumer_name TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES outbox(event_id), PRIMARY KEY(consumer_name,event_id)) STRICT;
`
export class JobError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
interface Row { id: string; state: string; attempts: number; checkpoint: number; object_id: string; expected_revision: number; session_id: string; user_id: string; lease_token: string }
type Tx = <T>(op: (db: DatabaseSync, now: number) => T) => T
export class JobStore {
  constructor(private tx: Tx, private revision: (session: string, user: string, object: string, now: number) => number | undefined,
    private fault: (point: 'job:after-result' | 'job:after-outbox' | 'event:after-receipt') => void) {}

  enqueue(actor: SessionActor, object: string, revision: number, key: string): string {
    return this.tx((db, now) => {
      const current = this.revision(actor.sessionId, actor.userId, object, now)
      if (current === undefined) throw new JobError(404, 'NOT_FOUND')
      const prior = db.prepare('SELECT id,object_id,expected_revision FROM jobs WHERE user_id=? AND idempotency_key=?').get(actor.userId,key)
      if (prior) {
        if (prior.object_id !== object || prior.expected_revision !== revision) throw new JobError(409, 'IDEMPOTENCY_CONFLICT')
        return String(prior.id)
      }
      if (current !== revision) throw new JobError(409, 'REVISION_CONFLICT')
      const id = randomUUID()
      db.prepare("INSERT INTO jobs(id,user_id,session_id,object_id,expected_revision,idempotency_key,state,available_at) VALUES(?,?,?,?,?,?,'queued',?)").run(id,actor.userId,actor.sessionId,object,revision,key,now)
      return id
    })
  }

  inspect(actor: SessionActor, id: string, cancel = false) {
    return this.tx((db,now) => {
      const row = db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(id,actor.userId) as unknown as Row | undefined
      if (!row || this.revision(actor.sessionId,actor.userId,row.object_id,now) === undefined) throw new JobError(404,'NOT_FOUND')
      if (cancel && ['succeeded','failed'].includes(row.state)) throw new JobError(409,'JOB_TERMINAL')
      if (cancel && row.state !== 'cancelled') this.end(db,row,'cancelled','CANCELLED',now)
      const summary = db.prepare('SELECT id,state,attempts,checkpoint,last_error,expected_revision FROM jobs WHERE id=?').get(id)
      const runs = db.prepare('SELECT attempt,start_checkpoint,started_at,ended_at,outcome FROM job_runs WHERE job_id=? ORDER BY attempt').all(id)
      const delivery = db.prepare('SELECT delivered_at,failures,retry_at,last_error FROM outbox WHERE job_id=?').get(id)
      return {...summary,runs,delivery:delivery ?? null}
    })
  }

  private end(db: DatabaseSync, row: Row, state: string, reason: string | null, now: number) {
    db.prepare('UPDATE job_runs SET ended_at=?,outcome=? WHERE job_id=? AND attempt=? AND ended_at IS NULL').run(now,reason ?? state,row.id,row.attempts)
    db.prepare('UPDATE jobs SET state=?,lease_token=NULL,lease_until=NULL,last_error=?,available_at=? WHERE id=?').run(state,reason,now+(state==='queued'?250:0),row.id)
  }

  claim(worker: string) {
    return this.tx((db,now) => {
      const lost = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_until<=? ORDER BY lease_until LIMIT 1").get(now) as unknown as Row | undefined
      if (lost) this.end(db,lost,lost.attempts>=3?'failed':'queued','LEASE_EXPIRED',now)
      const row = db.prepare("SELECT * FROM jobs WHERE state='queued' AND available_at<=? ORDER BY available_at,id LIMIT 1").get(now) as unknown as Row | undefined
      if (!row) return undefined
      const token = randomUUID()
      db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(token,now+3000,row.id)
      db.prepare('INSERT INTO job_runs(job_id,attempt,worker,started_at,start_checkpoint) VALUES(?,?,?,?,?)').run(row.id,row.attempts+1,worker,now,row.checkpoint)
      return {id:row.id,token,checkpoint:row.checkpoint}
    })
  }

  renew(token: string) {
    return this.tx((db,now) => db.prepare("UPDATE jobs SET lease_until=? WHERE state='running' AND lease_token=? AND lease_until>?").run(now+3000,token,now).changes===1)
  }
  step(token: string) {
    return this.tx((db,now) => {
      const row = db.prepare("SELECT * FROM jobs WHERE state='running' AND lease_token=? AND lease_until>?").get(token,now) as unknown as Row | undefined
      if (!row) return 'lost'
      const revision = this.revision(row.session_id,row.user_id,row.object_id,now)
      if (revision !== row.expected_revision) {
        this.end(db,row,'failed',revision===undefined?'AUTH_REVOKED':'REVISION_CONFLICT',now)
        return 'failed'
      }
      if (row.checkpoint===0) {
        db.prepare('UPDATE jobs SET checkpoint=1 WHERE id=?').run(row.id)
        return 'checkpoint'
      }
      db.prepare('INSERT INTO job_results(job_id,input_revision) VALUES(?,?)').run(row.id,revision)
      this.fault('job:after-result')
      db.prepare('INSERT INTO outbox(event_id,job_id,created_at) VALUES(?,?,?)').run(randomUUID(),row.id,now)
      this.fault('job:after-outbox')
      this.end(db,row,'succeeded',null,now)
      return 'succeeded'
    })
  }
  retry(token: string) {
    this.tx((db,now) => {
      const row = db.prepare('SELECT * FROM jobs WHERE lease_token=? AND lease_until>?').get(token,now) as unknown as Row | undefined
      if (row) this.end(db,row,row.attempts>=3?'failed':'queued','WORKER_ERROR',now)
    })
  }

  private receive(db: DatabaseSync, event: string, now: number) {
    const entry = db.prepare('SELECT delivered_at,failures,retry_at FROM outbox WHERE event_id=?').get(event)
    if (!entry || Number(entry.failures)>=3 || Number(entry.retry_at)>now) return false
    db.exec('SAVEPOINT consume_event')
    try {
      const inserted = db.prepare("INSERT INTO event_receipts(consumer_name,event_id) VALUES('probe',?) ON CONFLICT DO NOTHING").run(event)
      if (inserted.changes===1) this.fault('event:after-receipt')
      db.prepare('UPDATE outbox SET delivered_at=COALESCE(delivered_at,?),last_error=NULL WHERE event_id=?').run(now,event)
      db.exec('RELEASE consume_event')
      return inserted.changes===1
    } catch {
      db.exec('ROLLBACK TO consume_event; RELEASE consume_event')
      db.prepare("UPDATE outbox SET failures=failures+1,retry_at=?,last_error='CONSUMER_FAILED' WHERE event_id=?").run(now+250*(1+Number(entry.failures)),event)
      return false
    }
  }
  consume(event: string) { return this.tx((db,now) => this.receive(db,event,now)) }
  dispatch() { return this.tx((db,now) => {
    const event = db.prepare('SELECT event_id FROM outbox WHERE delivered_at IS NULL AND failures<3 AND retry_at<=? ORDER BY created_at LIMIT 1').get(now)
    return event ? this.receive(db,String(event.event_id),now) : false
  }) }
}

export function startWorker(store: JobStore, log: (msg: string) => void) {
  const worker = randomUUID()
  let token: string | undefined
  const timer = setInterval(() => {
    try {
      store.dispatch()
      if (!token) token = store.claim(worker)?.token
      else if (!store.renew(token) || store.step(token)!=='checkpoint') token = undefined
    } catch {
      log('knowledgeos-jobs: worker transaction failed')
      if (token) { try { store.retry(token) } catch { /* lease expiry recovers an unavailable store */ } token = undefined }
    }
  },500)
  timer.unref()
  return () => clearInterval(timer)
}
