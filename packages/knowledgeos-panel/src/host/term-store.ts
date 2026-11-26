import type { DatabaseSync } from 'node:sqlite'
import { AssetError } from './asset-store.ts'
import type { CitationSpec, CitationStore } from './citation-store.ts'
import type { RenderWitness } from './citation-locator.ts'
import type { SessionActor } from './identity.ts'
import type { ParseTx } from './parse-store.ts'

export const TERM_SCHEMA = `
CREATE TABLE saved_terms (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  conversion_id TEXT REFERENCES office_conversions(id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>start),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64), quote_hash TEXT NOT NULL CHECK(length(quote_hash)=64),
  explanation_json TEXT NOT NULL, supplement TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX saved_terms_owner_source ON saved_terms(service_id,owner_id,asset_id,version_id,created_at,id);
`

export interface TermExplanation {
  context: string
  plain: string
  professional: string
  confusions: { term: string; distinction: string }[]
  uncertainty: string
}
export type TermSource = CitationSpec & { quote_hash: string; quote: string; excerpt: string; title: string; kind: 'pdf' | 'office' | 'text'; origin: string }
export interface TermCard {
  explanation_id: string
  term: string
  source: TermSource
  explanation: TermExplanation
  provider: string
  model: string
}
interface StoredTerm {
  id: string; asset_id: string; version_id: string; conversion_id: string | null; ordinal: number;
  start: number; end: number; source_hash: string; quote_hash: string; explanation_json: string;
  supplement: string; provider: string; model: string; created_at: string
}

export interface TermUpdate {
  expected_revision: number
  favorite?: boolean
  supplement?: string
}

const sourceUrl = (spec: CitationSpec) => '/knowledgeos/reader?' + new URLSearchParams({
  asset: spec.asset_id, version: spec.version_id, unit: String(spec.ordinal), match: spec.start + ':' + spec.end + ':' + spec.source_hash,
  ...(spec.conversion_id ? { conversion: spec.conversion_id } : {}),
})

function trimBoundary(text: string, offset: number, delta: -1 | 1) {
  if (offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text.charAt(offset - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(offset))) return offset + delta
  return offset
}

export function termWindow(spec: CitationSpec, verified: ReturnType<CitationStore['verifySelection']>) {
  const { text, start, end, title, kind, quote_hash } = verified
  const from = trimBoundary(text, Math.max(0, start - 220), 1)
  const to = trimBoundary(text, Math.min(text.length, end + 220), -1)
  const quote = text.slice(start, end), before = text.slice(from, start), after = text.slice(end, to)
  const source: TermSource = { ...spec, quote_hash, quote, excerpt: text.slice(from, to), title, kind, origin: sourceUrl(spec) }
  return { source, before, after }
}

export class TermStore {
  constructor(private readonly tx: ParseTx, private readonly current: (actor: SessionActor, now: string) => SessionActor | undefined,
    private readonly citations: CitationStore) {}

  private actor(session: SessionActor, now: string) {
    const actor = this.current(session, now)
    if (!actor) throw new AssetError(401, 'AUTH_REQUIRED')
    return actor
  }

  selection(session: SessionActor, spec: CitationSpec, witness?: RenderWitness) {
    return termWindow(spec, this.citations.selection(session, spec, witness))
  }

  private row(db: DatabaseSync, actor: SessionActor, id: string) {
    return db.prepare('SELECT * FROM saved_terms WHERE service_id=? AND owner_id=? AND id=?')
      .get(actor.serviceId, actor.userId, id) as unknown as StoredTerm | undefined
  }

  private view(db: DatabaseSync, actor: SessionActor, row: StoredTerm, now: string) {
    const spec = { asset_id: row.asset_id, version_id: row.version_id, ordinal: row.ordinal, start: row.start, end: row.end, source_hash: row.source_hash,
      ...(row.conversion_id ? { conversion_id: row.conversion_id } : {}) }
    this.citations.checkStoredSelection(db, actor, { ...spec, quote_hash: row.quote_hash }, now)
    const { term, explanation, excerpt } = JSON.parse(row.explanation_json) as Pick<TermCard, 'term' | 'explanation'> & { excerpt?: string }
    const preferences = db.prepare('SELECT revision,favorite,supplement FROM term_card_preferences WHERE term_id=?').get(row.id)
    return { id: row.id, term, explanation, supplement: String(preferences?.supplement ?? row.supplement),
      favorite: preferences ? preferences.favorite === 1 : true, revision: Number(preferences?.revision ?? 0),
      provider: row.provider, model: row.model,
      source: { ...spec, quote_hash: row.quote_hash, origin: sourceUrl(spec), ...(excerpt ? { excerpt } : {}) }, created_at: row.created_at }
  }

  find(session: SessionActor, id: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(session, now), row = this.row(db, actor, id)
      return row ? this.view(db, actor, row, now) : undefined
    })
  }
  replaySave(session: SessionActor, id: string, supplement: string) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(session, now), row = this.row(db, actor, id)
      if (!row) throw new AssetError(404, 'TERM_EXPLANATION_NOT_FOUND')
      const term = this.view(db, actor, row, now)
      if (row.supplement !== supplement) throw new AssetError(409, 'IDEMPOTENCY_CONFLICT')
      return { term, replayed: true }
    })
  }

  update(session: SessionActor, id: string, change: TermUpdate) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(session, now), row = this.row(db, actor, id)
      if (!row) throw new AssetError(404, 'TERM_EXPLANATION_NOT_FOUND')
      const before = this.view(db, actor, row, now)
      if (change.expected_revision !== before.revision) throw new AssetError(409, 'TERM_REVISION_CONFLICT')
      const favorite = change.favorite ?? before.favorite, supplement = change.supplement ?? before.supplement
      if (favorite === before.favorite && supplement === before.supplement) return before
      db.prepare(`INSERT INTO term_card_preferences(term_id,service_id,owner_id,revision,favorite,supplement)
        VALUES(?,?,?,?,?,?) ON CONFLICT(term_id) DO UPDATE SET
        revision=excluded.revision,favorite=excluded.favorite,supplement=excluded.supplement`)
        .run(id, actor.serviceId, actor.userId, before.revision + 1, Number(favorite), supplement)
      return this.view(db, actor, row, now)
    })
  }

  knowledgeSource(db: DatabaseSync, actor: SessionActor, id: string, now: string) {
    const row = this.row(db, actor, id)
    if (!row) throw new AssetError(404, 'SOURCE_NOT_FOUND')
    const card = this.view(db, actor, row, now)
    const { excerpt: _excerpt, ...source } = card.source
    return { ...card, source }
  }

  list(session: SessionActor, asset: string, version: string, archived = false) {
    return this.tx('read', (db, now) => {
      const actor = this.actor(session, now)
      this.citations.validateTaskMaterial(db, actor, { asset_id: asset, version_id: version, ordinal: 1 }, now)
      const rows = db.prepare(`SELECT t.* FROM saved_terms t LEFT JOIN term_card_preferences p ON p.term_id=t.id
        WHERE t.service_id=? AND t.owner_id=? AND t.asset_id=? AND t.version_id=? AND coalesce(p.favorite,1)=?
        ORDER BY t.created_at DESC,t.id DESC LIMIT 100`)
        .all(actor.serviceId, actor.userId, asset, version, archived ? 0 : 1) as unknown as StoredTerm[]
      return rows.flatMap(row => {
        try { return [this.view(db, actor, row, now)] }
        catch (error) {
          if (error instanceof AssetError && ['CITATION_SOURCE_CHANGED', 'SOURCE_NOT_READY', 'SOURCE_NOT_FOUND'].includes(error.code)) return []
          throw error
        }
      })
    })
  }

  save(session: SessionActor, card: TermCard, supplement: string, witness?: RenderWitness) {
    return this.tx('write', (db, now) => {
      const actor = this.actor(session, now), source = card.source
      const verified = this.citations.verifySelection(db, actor, source, now, witness)
      if (verified.quote_hash !== source.quote_hash) throw new AssetError(409, 'CITATION_SOURCE_CHANGED')
      const existing = this.row(db, actor, card.explanation_id)
      if (existing) {
        if (existing.supplement !== supplement) throw new AssetError(409, 'IDEMPOTENCY_CONFLICT')
        return { term: this.view(db, actor, existing, now), replayed: true }
      }
      const count = db.prepare('SELECT count(*) n FROM saved_terms WHERE service_id=? AND owner_id=? AND asset_id=? AND version_id=?')
        .get(actor.serviceId, actor.userId, source.asset_id, source.version_id)?.n
      if (Number(count) >= 100) throw new AssetError(409, 'TERM_QUOTA')
      db.prepare('INSERT INTO saved_terms VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        card.explanation_id, actor.serviceId, actor.userId, source.asset_id, source.version_id, source.conversion_id ?? null, source.ordinal,
        source.start, source.end, source.source_hash, source.quote_hash, JSON.stringify({ term: card.term, explanation: card.explanation, excerpt: termWindow(source, verified).source.excerpt }),
        supplement, card.provider, card.model, now)
      return { term: this.view(db, actor, this.row(db, actor, card.explanation_id)!, now), replayed: false }
    })
  }
}
