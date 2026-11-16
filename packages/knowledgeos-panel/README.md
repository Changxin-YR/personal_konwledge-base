# knowledgeos-panel

One KnowledgeOS panel in the real DSH Web client plus two Host capabilities:

- **FND-001** read-only runtime status at `GET /knowledgeos/status`.
- **FND-002** a minimal local persistence probe at `POST /knowledgeos/foundation/records`
  and `GET /knowledgeos/foundation/records/{id}`, backed by an independent
  SQLite database.

This is foundation work only: no accounts, permissions, knowledge entities,
import, RAG, training, plans, product model calls, jobs/outbox, collaboration,
database UI, or installer.

## Host routes

| Route | Auth | Behavior |
|---|---|---|
| `GET /knowledgeos/status` | required | Existing read-only Host version/commit/instance/time metadata. It does not imply the database is ready. |
| `POST /knowledgeos/foundation/records` | required | Creates a synthetic probe record; `Idempotency-Key` is a canonical lowercase UUID. First write 201, same key + same content 200, same key + other content 409. |
| `GET /knowledgeos/foundation/records/{id}` | required | Reads the record from the SQLite database; 200 or 404. |

Success body:

```json
{
  "data": { "id": "uuid", "content": "...", "created_at": "2026-11-16T00:00:00.000Z" },
  "meta": { "request_id": "uuid", "schema_version": 1 }
}
```

Error body: `{ code, message, request_id, retryable, safe_details }` with
400 `INVALID_JSON`, 422 `INPUT_INVALID`, 413 `PAYLOAD_TOO_LARGE`,
415 `UNSUPPORTED_MEDIA_TYPE`, 405 `METHOD_NOT_ALLOWED`, 404 `NOT_FOUND`,
409 `IDEMPOTENCY_CONFLICT`, 503 `STORAGE_BUSY` (`retryable: true`),
503 `STORAGE_UNAVAILABLE`, 503 `STORAGE_INCOMPATIBLE`, and 500 `INTERNAL_ERROR`.

Input limits: request body 16 KiB, `content` 1–4096 UTF-8 bytes, strict UTF-8,
no lone surrogates, only the `content` field, and no normalization. SQL is
parameterized; SQL-looking text is stored as data.

## Trusted configuration

The Host row accepts `config.dataDir`, an absolute local directory. The
database is always `<dataDir>/knowledgeos.sqlite`. There is no default from
cwd, HOME, the build tree, or an HTTP request.

```yaml
- id: knowledgeos-host
  config:
    dataDir: "C:/KnowledgeOS/data/run-1"
```

- Missing `dataDir`: the FND-001 status route and panel keep working; the
  persistence routes return 503 `STORAGE_UNAVAILABLE`.
- Invalid/unopenable path: storage stays unavailable; there is no memory/JSON/
  DSH-KV fallback.

## Database

`node:sqlite` `DatabaseSync`, one controlled write connection, file
`knowledgeos.sqlite`, `application_id = 0x4B4F5331`, `user_version = 1`,
`journal_mode = WAL`, `foreign_keys = ON`, `synchronous = FULL`,
`busy_timeout = 250` ms.

Exactly two application tables:

- `schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`
- `storage_probe_records(id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)`

v1 DDL, the ledger row, `application_id`, and `user_version` commit in one
transaction. Existing databases are prechecked read-only for ownership,
version, table set, and ledger checksum; future versions, a different
application id, a bad checksum, or unknown non-empty schema are rejected
without deleting or rewriting the file. Close is idempotent, leaves the file,
and logs `knowledgeos-storage: closed`.

## Build

The committed `lib/` is what the profile loads. Rebuild from source:

```powershell
cd packages/knowledgeos-panel
npm install
node build.mjs
npx tsc -p tsconfig.json
```

`build.mjs` emits `lib/index.js` (Host), `lib/client.js` (DSH closure-factory
client bundle), and test-only `lib/storage.js` / `lib/test-support.js`. The
test-only files are not registered on any HTTP route.

## Install into an isolated profile

Use the fixed source checkout matching `config/upstream.lock.json`; do not
assume a global `dsh` has that version.

```powershell
$knowledgeosRepo = "<path-to-this-repository>"
$dshRoot = "$knowledgeosRepo\.cache\build\dsh-39163dd"
$dshTestHome = "$knowledgeosRepo\.cache\dsh-home-fnd002"
$knowledgeosDataDir = "$knowledgeosRepo\.cache\knowledgeos-fnd002-data\run-1"
$env:DSH_HOME = $dshTestHome
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"

# First creation only: initializes the profile from the shipped web template.
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --from-default-profile web --dump-config

# Install this checkout and set trusted dataDir in the profile patch.
node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-storage-test add "$knowledgeosRepo\packages\knowledgeos-panel"

# Run the fixed source build (no extra `web` positional).
cd $dshRoot
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-storage-test --port 3100 --no-open
```

The profile's `cordis.patch.yml` must override the inserted row config:

```yaml
- id: knowledgeos-host
  config:
    dataDir: "<absolute-data-directory>"
```

Remove the bundle with the same CLI and restart the test Host:

```powershell
node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-storage-test remove knowledgeos-panel
```

## Verification

The FND-002 runner starts/stops the isolated Host, uses real HTTP and real
SQLite, and writes per-test JSON evidence:

```powershell
node scripts/fnd002/run-all.mjs --out ".cache/fnd002-runs/manual" --run-id manual
node scripts/fnd002/scope-check.mjs
```

`scripts/fnd001/scope-check.mjs` remains the historical FND-001 check and
still rejects the package-wide SQLite import; it is not the FND-002 gate.
