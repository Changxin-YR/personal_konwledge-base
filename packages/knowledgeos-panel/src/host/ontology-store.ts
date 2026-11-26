import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { CitationStore } from './citation-store.ts'
import type { SessionActor } from './identity.ts'
import type { KnowledgeKind, KnowledgeStore } from './knowledge-store.ts'
import type { ParseTx } from './parse-store.ts'

export const ONTOLOGY_SCHEMA = `
CREATE TABLE relation_types (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=1), label TEXT NOT NULL,
  from_kinds TEXT NOT NULL, to_kinds TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('directed','symmetric')),
  same_domain INTEGER NOT NULL CHECK(same_domain IN (0,1)), same_kind INTEGER NOT NULL CHECK(same_kind IN (0,1)),
  PRIMARY KEY(id,version)
) STRICT;
INSERT INTO relation_types VALUES
  ('solves',1,'解决','["solution"]','["case"]','directed',1,0),
  ('depends_on',1,'依赖','["term","concept","case","solution"]','["concept"]','directed',1,0),
  ('compares',1,'对比','["term","concept","case","solution"]','["term","concept","case","solution"]','symmetric',1,1);
CREATE TABLE knowledge_relations (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  current_version_id TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(id,current_version_id) REFERENCES relation_versions(relation_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE relation_versions (
  id TEXT PRIMARY KEY, relation_id TEXT NOT NULL REFERENCES knowledge_relations(id), revision INTEGER NOT NULL CHECK(revision>=1),
  from_id TEXT NOT NULL, from_version_id TEXT NOT NULL, to_id TEXT NOT NULL, to_version_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, relation_type_version INTEGER NOT NULL, evidence_json TEXT NOT NULL,
  proposal_kind TEXT NOT NULL CHECK(proposal_kind IN ('human','ai')), proposal_actor TEXT NOT NULL REFERENCES users(id),
  provider TEXT, model TEXT, reason TEXT,
  state TEXT NOT NULL CHECK(state IN ('proposed','confirmed','rejected')), review_action TEXT CHECK(review_action IN ('correct','confirm','reject')),
  reviewed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL,
  CHECK(from_id<>to_id),
  CHECK((proposal_kind='ai')=(provider IS NOT NULL AND model IS NOT NULL AND reason IS NOT NULL)),
  CHECK((review_action IS NULL)=(reviewed_by IS NULL)),
  CHECK(CASE state WHEN 'confirmed' THEN review_action IS 'confirm' WHEN 'rejected' THEN review_action IS 'reject'
    ELSE review_action IS NULL OR review_action IS 'correct' END),
  FOREIGN KEY(from_id,from_version_id) REFERENCES knowledge_versions(item_id,id),
  FOREIGN KEY(to_id,to_version_id) REFERENCES knowledge_versions(item_id,id),
  FOREIGN KEY(relation_type,relation_type_version) REFERENCES relation_types(id,version),
  UNIQUE(relation_id,revision), UNIQUE(relation_id,id)
) STRICT;
CREATE INDEX relations_owner ON knowledge_relations(service_id,owner_id,created_at,id);
CREATE INDEX relation_pair ON relation_versions(relation_type,from_id,to_id,state);
CREATE TABLE relation_write_receipts (
  service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64), relation_id TEXT NOT NULL, version_id TEXT NOT NULL,
  FOREIGN KEY(relation_id,version_id) REFERENCES relation_versions(relation_id,id),
  PRIMARY KEY(service_id,owner_id,request_key)
) STRICT;
`

interface RelationType {
  id: string; version: number; label: string; from_kinds: KnowledgeKind[]; to_kinds: KnowledgeKind[]
  direction: 'directed' | 'symmetric'; same_domain: boolean; same_kind: boolean
}
export interface RelationPair { from_id: string; to_id: string; evidence_citation_ids: string[] }
export interface RelationDraft extends RelationPair { relation_type: string }
export interface ModelProposal { provider: string; model: string; reason: string }
type Review = 'confirm' | 'reject' | 'correct'
type Node = ReturnType<KnowledgeStore['relationNode']>
type Citation = ReturnType<CitationStore['knowledgeSource']>
interface Relation { id: string; current_version_id: string }
interface Version {
  id: string; relation_id: string; revision: number; from_id: string; from_version_id: string; to_id: string; to_version_id: string
  relation_type: string; relation_type_version: number; evidence_json: string; proposal_kind: 'human' | 'ai'; proposal_actor: string
  provider: string | null; model: string | null; reason: string | null
  state: 'proposed' | 'confirmed' | 'rejected'; review_action: Review | null; reviewed_by: string | null; created_at: string
}

const hidden = () => new AssetError(404, 'RELATION_NOT_FOUND')
const stale = () => new AssetError(409, 'RELATION_SOURCE_CHANGED')
const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex')

export class OntologyStore {
  constructor(private readonly tx: ParseTx, private readonly current: (actor: SessionActor, now: string) => SessionActor | undefined,
    private readonly knowledge: KnowledgeStore, private readonly citations: CitationStore) {}

  private actor(prior: SessionActor, now: string) {
    const actor = this.current(prior, now)
    if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
    return actor
  }

  private rules(db: DatabaseSync): RelationType[] {
    return db.prepare(`SELECT r.* FROM relation_types r
      WHERE r.version=(SELECT max(v.version) FROM relation_types v WHERE v.id=r.id) ORDER BY r.id`).all().map(row => ({
      id: String(row.id), label: String(row.label), version: Number(row.version),
      from_kinds: JSON.parse(String(row.from_kinds)), to_kinds: JSON.parse(String(row.to_kinds)),
      direction: row.direction as RelationType['direction'], same_domain: row.same_domain === 1, same_kind: row.same_kind === 1,
    }))
  }

  types(prior: SessionActor) {
    return this.tx('read', (db, now) => { this.actor(prior, now); return this.rules(db) })
  }

  private node(db: DatabaseSync, actor: SessionActor, id: string, now: string, pinned?: string) {
    try { return this.knowledge.relationNode(db, actor, id, now, pinned) }
    catch (error) { if (error instanceof AssetError && error.status === 404) throw hidden(); throw error }
  }

  private evidence(db: DatabaseSync, actor: SessionActor, id: string, now: string) {
    try { return this.citations.knowledgeSource(db, actor, id, now) }
    catch (error) { if (error instanceof AssetError && error.status === 404) throw hidden(); throw error }
  }

  private changed(db: DatabaseSync, citation: Citation) {
    return citation.version_id !== db.prepare('SELECT id FROM asset_versions WHERE asset_id=? ORDER BY version DESC LIMIT 1')
      .get(citation.asset_id)?.id
  }

  private inputs(db: DatabaseSync, actor: SessionActor, pair: RelationPair, now: string) {
    const from = this.node(db, actor, pair.from_id, now)
    const to = this.node(db, actor, pair.to_id, now)
    const evidence = pair.evidence_citation_ids.map(id => this.evidence(db, actor, id, now))
    if (evidence.some(citation => this.changed(db, citation))) throw stale()
    const rules = this.rules(db).filter(rule => from.id !== to.id &&
      rule.from_kinds.includes(from.kind) && rule.to_kinds.includes(to.kind) &&
      (!rule.same_domain || from.domain === to.domain) && (!rule.same_kind || from.kind === to.kind))
    return { from, to, evidence, rules, fingerprint: hash([from.version_id, to.version_id, evidence, rules]) }
  }

  private owned(db: DatabaseSync, actor: SessionActor, id: string) {
    const row = db.prepare('SELECT id,current_version_id FROM knowledge_relations WHERE service_id=? AND owner_id=? AND id=?')
      .get(actor.serviceId, actor.userId, id) as unknown as Relation | undefined
    if (!row) throw hidden()
    return row
  }

  private version(db: DatabaseSync, relation: Relation, revision?: number) {
    const row = (revision === undefined
      ? db.prepare('SELECT * FROM relation_versions WHERE relation_id=? AND id=?').get(relation.id, relation.current_version_id)
      : db.prepare('SELECT * FROM relation_versions WHERE relation_id=? AND revision=?').get(relation.id, revision)) as unknown as Version | undefined
    if (!row) throw hidden()
    return row
  }

  private view(db: DatabaseSync, actor: SessionActor, row: Version, now: string) {
    const from = this.node(db, actor, row.from_id, now, row.from_version_id)
    const to = this.node(db, actor, row.to_id, now, row.to_version_id)
    const evidence = (JSON.parse(row.evidence_json) as Citation[]).map(citation => {
      const current = this.evidence(db, actor, citation.id, now)
      if (hash(current) !== hash(citation)) throw stale()
      return { ...citation, state: this.changed(db, citation) ? 'changed' : 'fixed',
        href: '/knowledgeos/reader?' + new URLSearchParams({ asset: citation.asset_id, version: citation.version_id, citation: citation.id }) }
    })
    const changed = from.changed || to.changed || evidence.some(item => item.state === 'changed') ||
      db.prepare('SELECT max(version) version FROM relation_types WHERE id=?').get(row.relation_type)?.version !== row.relation_type_version
    const summary = ({ id, version_id, kind, domain, title }: Node) => ({ id, version_id, kind, domain, title })
    return {
      id: row.relation_id, version_id: row.id, revision: row.revision, from: summary(from), to: summary(to),
      relation_type: row.relation_type, relation_type_version: row.relation_type_version,
      recorded_state: row.state, state: changed && row.state !== 'rejected' ? 'needs_review' : row.state,
      evidence, proposal: { kind: row.proposal_kind, actor_id: row.proposal_actor, provider: row.provider, model: row.model, reason: row.reason },
      review: row.review_action ? { action: row.review_action, actor_id: row.reviewed_by, at: row.created_at } : null, created_at: row.created_at,
    }
  }

  private accessible<T>(operation: () => T): T[] {
    try { return [operation()] }
    catch (error) {
      if (error instanceof AssetError && (error.status === 404 || error.status === 409)) return []
      throw error
    }
  }

  list(prior: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const rows = db.prepare('SELECT id,current_version_id FROM knowledge_relations WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC')
        .all(actor.serviceId, actor.userId) as unknown as Relation[]
      const relations = rows.flatMap(row => this.accessible(() => this.view(db, actor, this.version(db, row), now)))
      return { relations, facts: relations.filter(row => row.state === 'confirmed') }
    })
  }

  get(prior: SessionActor, id: string, revision?: number) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now), relation = this.owned(db, actor, id)
      return this.view(db, actor, this.version(db, relation, revision), now)
    })
  }

  history(prior: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now), relation = this.owned(db, actor, id)
      const rows = db.prepare('SELECT * FROM relation_versions WHERE relation_id=? ORDER BY revision DESC').all(relation.id) as unknown as Version[]
      const versions = rows.flatMap(row => this.accessible(() => this.view(db, actor, row, now)))
      if (!versions.length) throw hidden()
      return versions
    })
  }

  private replay(db: DatabaseSync, actor: SessionActor, key: string, action: unknown, now: string) {
    const receipt = db.prepare('SELECT digest,relation_id,version_id FROM relation_write_receipts WHERE service_id=? AND owner_id=? AND request_key=?')
      .get(actor.serviceId, actor.userId, key)
    if (!receipt) return
    const relation = this.owned(db, actor, String(receipt.relation_id))
    const row = db.prepare('SELECT * FROM relation_versions WHERE relation_id=? AND id=?')
      .get(relation.id, String(receipt.version_id)) as unknown as Version
    const value = this.view(db, actor, row, now)
    if (receipt.digest !== hash(action)) throw new AssetError(409, 'IDEMPOTENCY_CONFLICT')
    return { relation: value, replayed: true }
  }

  prepareModel(prior: SessionActor, key: string, pair: RelationPair) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const receipt = this.replay(db, actor, key, ['ai', pair], now)
      if (receipt) return { receipt } as const
      const input = this.inputs(db, actor, pair, now)
      if (!input.rules.length) throw new AssetError(422, 'RELATION_RULE_VIOLATION')
      return { input } as const
    })
  }

  private write(prior: SessionActor, key: string, action: unknown, apply: (db: DatabaseSync, actor: SessionActor, now: string) => Version) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), replay = this.replay(db, actor, key, action, now)
      if (replay) return replay
      const row = apply(db, actor, now)
      db.prepare('INSERT INTO relation_write_receipts VALUES(?,?,?,?,?,?)').run(actor.serviceId, actor.userId, key, hash(action), row.relation_id, row.id)
      return { relation: this.view(db, actor, row, now), replayed: false }
    })
  }

  private draft(db: DatabaseSync, actor: SessionActor, id: string, pair: RelationPair, type: string, now: string, fingerprint?: string) {
    const { from, to, evidence, rules, fingerprint: current } = this.inputs(db, actor, pair, now)
    if (fingerprint !== undefined && current !== fingerprint) throw stale()
    const rule = rules.find(value => value.id === type)
    if (!rule) throw new AssetError(422, 'RELATION_RULE_VIOLATION')
    const [start, end] = rule.direction === 'symmetric' && from.id > to.id ? [to, from] : [from, to]
    const duplicate = db.prepare(`SELECT 1 FROM relation_versions v JOIN knowledge_relations r ON r.current_version_id=v.id
      WHERE r.service_id=? AND r.owner_id=? AND r.id<>? AND v.relation_type=? AND v.from_id=? AND v.to_id=? AND v.state<>'rejected'`)
      .get(actor.serviceId, actor.userId, id, rule.id, start.id, end.id)
    if (duplicate) throw new AssetError(409, 'DUPLICATE_RELATION')
    return { from_id: start.id, from_version_id: start.version_id, to_id: end.id, to_version_id: end.version_id,
      relation_type: rule.id, relation_type_version: rule.version, evidence_json: JSON.stringify(evidence) }
  }

  private insert(db: DatabaseSync, relation: Relation, row: Version) {
    db.prepare('INSERT INTO relation_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      row.id, row.relation_id, row.revision, row.from_id, row.from_version_id, row.to_id, row.to_version_id,
      row.relation_type, row.relation_type_version, row.evidence_json, row.proposal_kind, row.proposal_actor,
      row.provider, row.model, row.reason, row.state, row.review_action, row.reviewed_by, row.created_at)
    if (Number(db.prepare('UPDATE knowledge_relations SET current_version_id=? WHERE id=? AND current_version_id=?')
      .run(row.id, relation.id, relation.current_version_id).changes) !== 1) throw new AssetError(409, 'REVISION_CONFLICT')
    return row
  }

  create(prior: SessionActor, key: string, pair: RelationPair, type: string, proposal?: ModelProposal, fingerprint?: string) {
    return this.write(prior, key, proposal ? ['ai', pair] : ['human', pair, type], (db, actor, now) => {
      const relation = { id: randomUUID(), current_version_id: '' }
      const draft = this.draft(db, actor, relation.id, pair, type, now, fingerprint)
      db.prepare('INSERT INTO knowledge_relations VALUES(?,?,?,?,?)').run(relation.id, actor.serviceId, actor.userId, '', now)
      return this.insert(db, relation, { ...draft, id: randomUUID(), relation_id: relation.id, revision: 1, created_at: now,
        proposal_kind: proposal ? 'ai' : 'human', proposal_actor: actor.userId, provider: proposal?.provider ?? null,
        model: proposal?.model ?? null, reason: proposal?.reason ?? null, state: 'proposed', review_action: null, reviewed_by: null })
    })
  }

  review(prior: SessionActor, key: string, id: string, expected: number, action: Review, correction?: RelationDraft) {
    return this.write(prior, key, ['review', id, expected, action, correction], (db, actor, now) => {
      const relation = this.owned(db, actor, id), current = this.version(db, relation)
      const previous = this.view(db, actor, current, now)
      if (expected !== current.revision || expected >= Number.MAX_SAFE_INTEGER) throw new AssetError(409, 'REVISION_CONFLICT')
      if (action === 'confirm' && previous.state === 'needs_review') throw stale()
      if (action === 'confirm' && previous.state !== 'proposed' || action === 'reject' && previous.state === 'rejected')
        throw new AssetError(409, 'INVALID_RELATION_REVIEW_STATE')
      const next = correction ? this.draft(db, actor, id, correction, correction.relation_type, now) : current
      return this.insert(db, relation, { ...current, ...next, id: randomUUID(), revision: current.revision + 1, created_at: now,
        state: action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'proposed',
        review_action: action, reviewed_by: actor.userId })
    })
  }
}
