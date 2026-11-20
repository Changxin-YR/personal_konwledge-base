// A v14 citation has no snapshot: absence is intentional, not an empty object.
export const CITATION_LOCATOR_SCHEMA = `CREATE TABLE citation_locators (
  citation_id TEXT PRIMARY KEY REFERENCES citations(id),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND json_type(snapshot)='object')
) STRICT;`
