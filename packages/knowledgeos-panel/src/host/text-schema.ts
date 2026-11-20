// The original v7 definition and ledger stay immutable. The new constraint
// describes stored bytes, while format-specific metadata belongs to a version.
export const TEXT_SCHEMA = `CREATE TEMP TABLE kos_prior_blobs AS SELECT id,storage_key,sha256,byte_length,media_type FROM blobs;
DROP TABLE blobs;
CREATE TABLE blobs (
  id TEXT PRIMARY KEY, storage_key TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','text/plain','text/markdown'))
) STRICT;
INSERT INTO blobs SELECT id,storage_key,sha256,byte_length,media_type FROM kos_prior_blobs;
DROP TABLE kos_prior_blobs;
CREATE TABLE text_versions (version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), encoding TEXT NOT NULL, block_count INTEGER NOT NULL CHECK(block_count>=0)) STRICT;
CREATE TABLE text_blocks (version_id TEXT NOT NULL REFERENCES text_versions(version_id), ordinal INTEGER NOT NULL CHECK(ordinal>=1),
  kind TEXT NOT NULL, start INTEGER NOT NULL CHECK(start>=0), end INTEGER NOT NULL CHECK(end>=start), text TEXT NOT NULL, anchor TEXT NOT NULL,
  PRIMARY KEY(version_id,ordinal)) STRICT;`
