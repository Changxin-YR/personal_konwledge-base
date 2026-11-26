import type { CitationSpec } from './citation-store.ts'

export const TERM_PRACTICE_SCHEMA = `
CREATE UNIQUE INDEX saved_terms_identity ON saved_terms(id,service_id,owner_id);
CREATE TABLE term_card_preferences (
  term_id TEXT PRIMARY KEY, service_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1), favorite INTEGER NOT NULL CHECK(favorite IN (0,1)),
  supplement TEXT NOT NULL,
  FOREIGN KEY(term_id,service_id,owner_id) REFERENCES saved_terms(id,service_id,owner_id)
) STRICT;
CREATE TABLE term_practice_origins (
  session_id TEXT PRIMARY KEY, service_id TEXT NOT NULL, user_id TEXT NOT NULL, term_id TEXT NOT NULL,
  FOREIGN KEY(session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  FOREIGN KEY(term_id,service_id,user_id) REFERENCES saved_terms(id,service_id,owner_id)
) STRICT;
`

/** A larger citation may cover the term, but another occurrence on that page is a different source. */
export function coversTerm(citation: CitationSpec, term: CitationSpec) {
  return citation.asset_id === term.asset_id && citation.version_id === term.version_id &&
    citation.ordinal === term.ordinal && (citation.conversion_id ?? null) === (term.conversion_id ?? null) &&
    citation.source_hash === term.source_hash && citation.start <= term.start && citation.end >= term.end
}
