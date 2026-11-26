import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { CitationStore } from './citation-store.ts'
import type { Domain, SessionActor } from './identity.ts'
import type { NoteStore } from './note-store.ts'
import type { ParseTx } from './parse-store.ts'
import type { TermStore } from './term-store.ts'

export const KNOWLEDGE_SCHEMA = `
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('term','concept','case','solution')),
  domain TEXT NOT NULL CHECK(domain IN ('software_engineering','system_architecture','hardware_engineering','ai_development')),
  current_version_id TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(id,current_version_id) REFERENCES knowledge_versions(item_id,id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE knowledge_versions (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  revision INTEGER NOT NULL CHECK(revision>=1), title TEXT NOT NULL, definition TEXT NOT NULL, plain_explanation TEXT NOT NULL, context TEXT NOT NULL,
  sources_json TEXT NOT NULL, author_kind TEXT NOT NULL CHECK(author_kind IN ('human','assisted')),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  confirmation_state TEXT NOT NULL CHECK(confirmation_state IN ('pending','confirmed')),
  confirmed_by TEXT REFERENCES users(id), confirmed_at TEXT,
  CHECK((confirmation_state='confirmed')=(confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK((confirmed_by IS NULL)=(confirmed_at IS NULL)), UNIQUE(item_id,revision), UNIQUE(item_id,id)
) STRICT;
CREATE TABLE knowledge_write_receipts (
  service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64), item_id TEXT NOT NULL, version_id TEXT NOT NULL,
  FOREIGN KEY(item_id,version_id) REFERENCES knowledge_versions(item_id,id), PRIMARY KEY(service_id,owner_id,request_key)
) STRICT;
CREATE INDEX knowledge_items_owner ON knowledge_items(service_id,owner_id,created_at,id);
`

export const knowledgeKinds = ['term', 'concept', 'case', 'solution'] as const
export type KnowledgeKind = typeof knowledgeKinds[number]
export type KnowledgeSourceInput = { type: 'citation' | 'term'; id: string } | { type: 'note'; id: string; revision: number }
export interface KnowledgeDraft {
  title: string; definition: string; plain_explanation: string; context: string
  sources: KnowledgeSourceInput[]
}
type CitationWitness = ReturnType<CitationStore['knowledgeSource']>
type NoteWitness = Omit<ReturnType<NoteStore['knowledgeSource']>, 'citations'>
type TermWitness = ReturnType<TermStore['knowledgeSource']>
type KnowledgeSource =
  | ({ type: 'citation' } & CitationWitness)
  | ({ type: 'note'; dependencies: CitationWitness[] } & NoteWitness)
  | { type: 'term'; id: string; title: string; provenance: TermWitness['source']; provider: string; model: string }

interface ItemRow { id: string; kind: KnowledgeKind; domain: Domain; current_version_id: string; created_at: string }
interface VersionRow {
  id: string; item_id: string; revision: number; title: string; definition: string; plain_explanation: string; context: string
  sources_json: string; author_kind: 'human' | 'assisted'; confirmation_state: 'pending' | 'confirmed'
  created_by: string; created_at: string; confirmed_by: string | null; confirmed_at: string | null
}
const noAccess = () => new AssetError(404, 'KNOWLEDGE_ITEM_NOT_FOUND')
const invalidSource = () => new AssetError(404, 'SOURCE_NOT_FOUND')
const conflict = () => new AssetError(409, 'REVISION_CONFLICT')
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const origin = (source: CitationWitness) => '/knowledgeos/reader?' + new URLSearchParams({
  asset: source.asset_id, version: source.version_id, citation: source.id,
})

export class KnowledgeStore {
  constructor(private readonly tx: ParseTx, private readonly current: (actor: SessionActor, now: string) => SessionActor | undefined,
    private readonly citations: CitationStore, private readonly notes: NoteStore, private readonly terms: TermStore) {}

  private actor(prior: SessionActor, now: string) {
    const actor = this.current(prior, now)
    if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
    return actor
  }

  private owned(db: DatabaseSync, actor: SessionActor, id: string) {
    const row = db.prepare('SELECT id,kind,domain,current_version_id,created_at FROM knowledge_items WHERE service_id=? AND owner_id=? AND id=?')
      .get(actor.serviceId, actor.userId, id) as unknown as ItemRow | undefined
    if (!row) throw noAccess()
    return row
  }

  private version(db: DatabaseSync, item: ItemRow, revision?: number) {
    const row = (revision === undefined
      ? db.prepare('SELECT * FROM knowledge_versions WHERE item_id=? AND id=?').get(item.id, item.current_version_id)
      : db.prepare('SELECT * FROM knowledge_versions WHERE item_id=? AND revision=?').get(item.id, revision)) as unknown as VersionRow | undefined
    if (!row) throw noAccess()
    return row
  }

  private pin(db: DatabaseSync, actor: SessionActor, inputs: readonly KnowledgeSourceInput[], now: string): KnowledgeSource[] {
    return inputs.map(input => {
      if (input.type === 'citation') return { type: 'citation', ...this.citations.knowledgeSource(db, actor, input.id, now) }
      if (input.type === 'term') {
        const term = this.terms.knowledgeSource(db, actor, input.id, now)
        return { type: 'term', id: term.id, title: term.term, provenance: term.source, provider: term.provider, model: term.model }
      }
      if (input.type !== 'note') throw invalidSource()
      const { citations, ...note } = this.notes.knowledgeSource(db, actor, input.id)
      if (note.revision !== input.revision) throw new AssetError(409, 'KNOWLEDGE_SOURCE_CHANGED')
      return { type: 'note', ...note, dependencies: citations.map(id => this.citations.knowledgeSource(db, actor, id, now)) }
    })
  }

  private validatedSources(db: DatabaseSync, actor: SessionActor, row: VersionRow, now: string) {
    return (JSON.parse(row.sources_json) as KnowledgeSource[]).map(source => {
      if (source.type === 'citation') {
        this.citations.checkStoredSelection(db, actor, source, now)
        return { ...source, category: 'excerpt', state: 'fixed', href: origin(source) }
      }
      if (source.type === 'term') {
        this.citations.checkStoredSelection(db, actor, source.provenance, now)
        this.terms.knowledgeSource(db, actor, source.id, now)
        return { ...source, category: 'assisted', state: 'fixed', href: source.provenance.origin }
      }
      const note = this.notes.knowledgeSource(db, actor, source.id)
      for (const citation of source.dependencies) this.citations.checkStoredSelection(db, actor, citation, now)
      const { dependencies, ...witness } = source
      const stable = note.revision === source.revision && note.content_hash === source.content_hash
      return { ...witness, dependency_count: dependencies.length, category: 'note', state: stable ? 'fixed' : 'changed',
        href: stable ? '/knowledgeos/notes?' + new URLSearchParams({ note: source.id }) : null }
    })
  }

  private view(db: DatabaseSync, actor: SessionActor, item: ItemRow, row: VersionRow, now: string) {
    const sources = this.validatedSources(db, actor, row, now)
    return { id: item.id, version_id: row.id, version: row.revision, is_current: row.id === item.current_version_id,
      kind: item.kind, domain: item.domain, title: row.title, definition: row.definition, plain_explanation: row.plain_explanation, context: row.context,
      sources, source_kind: sources.length ? 'sourced' : 'original', author_kind: row.author_kind,
      created_by: row.created_by, created_at: row.created_at, confirmation_state: row.confirmation_state, confirmed_by: row.confirmed_by, confirmed_at: row.confirmed_at }
  }

  relationNode(db: DatabaseSync, actor: SessionActor, id: string, now: string, pinned?: string) {
    const item = this.owned(db, actor, id)
    const row = pinned === undefined ? this.version(db, item) : db.prepare('SELECT * FROM knowledge_versions WHERE item_id=? AND id=?')
      .get(item.id, pinned) as unknown as VersionRow | undefined
    if (!row) throw noAccess()
    const sources = this.validatedSources(db, actor, row, now)
    const changed = row.id !== item.current_version_id || sources.some(source => source.state === 'changed')
    if (pinned === undefined && (changed || row.confirmation_state !== 'confirmed')) throw new AssetError(409, 'RELATION_NODE_UNCONFIRMED')
    return { id, version_id: row.id, kind: item.kind, domain: item.domain, title: row.title, definition: row.definition, changed }
  }

  private visible<T>(operation: () => T): T[] {
    try { return [operation()] }
    catch (error) {
      if (error instanceof AssetError && [404,409].includes(error.status)) return []
      throw error
    }
  }

  list(prior: SessionActor) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now)
      const rows = db.prepare('SELECT id,kind,domain,current_version_id,created_at FROM knowledge_items WHERE service_id=? AND owner_id=? ORDER BY created_at DESC,id DESC')
        .all(actor.serviceId, actor.userId) as unknown as ItemRow[]
      return rows.flatMap(row => this.visible(() => {
        const version = this.version(db, row), item = this.view(db, actor, row, version, now)
        const { id, title, domain, kind, version_id, confirmation_state, source_kind } = item
        return { id, title, domain, kind, version_id, version: version.revision, confirmation_state, source_kind }
      }))
    })
  }

  get(prior: SessionActor, id: string, revision?: number) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now), item = this.owned(db, actor, id)
      return this.view(db, actor, item, this.version(db, item, revision), now)
    })
  }

  history(prior: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(prior, now), item = this.owned(db, actor, id)
      const versions = db.prepare('SELECT * FROM knowledge_versions WHERE item_id=? ORDER BY revision DESC').all(id) as unknown as VersionRow[]
      return versions.flatMap(row => this.visible(() => {
        this.validatedSources(db, actor, row, now)
        return { version: row.revision, version_id: row.id, confirmation_state: row.confirmation_state, created_at: row.created_at, is_current: row.id === item.current_version_id }
      }))
    })
  }

  private insert(db: DatabaseSync, item: ItemRow, actor: SessionActor, revision: number, data: Omit<KnowledgeDraft,'sources'>,
    sources: KnowledgeSource[], now: string, confirm: boolean): VersionRow {
    const row: VersionRow = {
      id: randomUUID(), item_id: item.id, revision, title: data.title, definition: data.definition, plain_explanation: data.plain_explanation, context: data.context,
      sources_json: JSON.stringify(sources), author_kind: sources.some(s => s.type === 'term') ? 'assisted' : 'human',
      created_by: actor.userId, created_at: now, confirmation_state: confirm ? 'confirmed' : 'pending',
      confirmed_by: confirm ? actor.userId : null, confirmed_at: confirm ? now : null,
    }
    db.prepare('INSERT INTO knowledge_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      row.id,row.item_id,row.revision,row.title,row.definition,row.plain_explanation,row.context,row.sources_json,row.author_kind,
      row.created_by,row.created_at,row.confirmation_state,row.confirmed_by,row.confirmed_at)
    return row
  }

  private write(prior: SessionActor, key: string, action: unknown, apply: (db: DatabaseSync, actor: SessionActor, now: string) => { item: ItemRow; row: VersionRow }) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(prior, now), digest = hash(action)
      const receipt = db.prepare('SELECT item_id,version_id,digest FROM knowledge_write_receipts WHERE service_id=? AND owner_id=? AND request_key=?')
        .get(actor.serviceId, actor.userId, key)
      if (receipt) {
        const item = this.owned(db, actor, String(receipt.item_id))
        const row = db.prepare('SELECT * FROM knowledge_versions WHERE item_id=? AND id=?')
          .get(item.id, receipt.version_id!) as unknown as VersionRow
        const result = this.view(db, actor, item, row, now)
        if (receipt.digest !== digest) throw new AssetError(409, 'IDEMPOTENCY_CONFLICT')
        return { item: result, replayed: true }
      }
      const { item, row } = apply(db, actor, now)
      db.prepare('INSERT INTO knowledge_write_receipts VALUES(?,?,?,?,?,?)').run(actor.serviceId, actor.userId, key, digest, item.id, row.id)
      return { item: this.view(db, actor, item, row, now), replayed: false }
    })
  }

  create(prior: SessionActor, key: string, input: KnowledgeDraft & { kind: KnowledgeKind; domain: Domain }) {
    return this.write(prior, key, ['create',input], (db, actor, now) => {
      const { kind, domain, sources, ...draft } = input
      const pinned = this.pin(db, actor, sources, now)
      const item: ItemRow = { id: randomUUID(), kind, domain, current_version_id: '', created_at: now }
      db.prepare('INSERT INTO knowledge_items VALUES(?,?,?,?,?,?,?)').run(item.id, actor.serviceId, actor.userId, kind, domain, '', now)
      const row = this.insert(db, item, actor, 1, draft, pinned, now, false)
      db.prepare('UPDATE knowledge_items SET current_version_id=? WHERE id=?').run(row.id, item.id)
      return { item: { ...item, current_version_id: row.id }, row }
    })
  }

  update(prior: SessionActor, key: string, id: string, expected: number, draft?: KnowledgeDraft) {
    return this.write(prior, key, [draft ? 'correct' : 'confirm',id,expected,draft], (db, actor, now) => {
      const item = this.owned(db, actor, id), current = this.version(db, item)
      const previous = this.validatedSources(db, actor, current, now)
      if (expected !== current.revision || current.revision >= Number.MAX_SAFE_INTEGER) throw conflict()
      if (!draft && current.confirmation_state === 'confirmed') throw new AssetError(409, 'ALREADY_CONFIRMED')
      if (!draft && previous.some(source => source.state === 'changed')) throw new AssetError(409, 'KNOWLEDGE_SOURCE_CHANGED')
      const pinned = draft ? this.pin(db, actor, draft.sources, now) : JSON.parse(current.sources_json) as KnowledgeSource[]
      const row = this.insert(db, item, actor, current.revision + 1, draft ?? current, pinned, now, !draft)
      if (Number(db.prepare('UPDATE knowledge_items SET current_version_id=? WHERE id=? AND current_version_id=?')
        .run(row.id, item.id, current.id).changes) !== 1) throw conflict()
      return { item: { ...item, current_version_id: row.id }, row }
    })
  }
}
