// ZIP staging is private to the uploader. A staged member becomes a library
// asset only through the normal, idempotent version publication transaction.
export const ZIP_SCHEMA = `CREATE TABLE zip_imports (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), upload_key TEXT NOT NULL,
  title TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_length INTEGER NOT NULL CHECK(byte_length>0), created_at TEXT NOT NULL,
  UNIQUE(owner_id,upload_key)
) STRICT;
CREATE INDEX zip_import_owner ON zip_imports(owner_id);
CREATE TABLE zip_entries (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  name TEXT NOT NULL, path TEXT NOT NULL, byte_length INTEGER NOT NULL CHECK(byte_length>=0),
  compressed_size INTEGER NOT NULL CHECK(compressed_size>=0), media_type TEXT, reason TEXT,
  state TEXT NOT NULL CHECK(state IN ('available','selected','imported','failed')),
  publish_key TEXT NOT NULL UNIQUE, version_id TEXT UNIQUE REFERENCES asset_versions(id), error TEXT,
  CHECK((state='imported')=(version_id IS NOT NULL)), CHECK((state='failed')=(error IS NOT NULL)),
  CHECK(reason IS NULL OR state='available'), UNIQUE(import_id,ordinal), UNIQUE(import_id,path)
) STRICT;
CREATE TABLE zip_selections (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES zip_imports(id), owner_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL, selection_digest TEXT NOT NULL CHECK(length(selection_digest)=64), member_ids TEXT NOT NULL CHECK(json_valid(member_ids) AND json_type(member_ids)='array'), created_at TEXT NOT NULL,
  UNIQUE(owner_id,request_key)
) STRICT;`
