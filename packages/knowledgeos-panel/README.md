# knowledgeos-panel (FND-001)

One KnowledgeOS main panel and one sidebar entry, backed by one read-only
Host route. It is the FND-001 foundation slice only: no database, accounts,
permissions, import, RAG, training, plans, or product model calls.

## What it contributes

| Half | Surface | Effect |
|---|---|---|
| Host | `GET /knowledgeos/status` (`auth: 'required'`) | Returns the running DSH build identity, this plugin instance's opaque id and start time, the query time, and the commit-verification result |
| Client | `main` panel keyed `knowledgeos` | Renders loading, connected, mismatched-build, and failed/stale states with refresh and retry |
| Client | `sidebar.panellist` entry `knowledgeos` | Opens the panel from the existing sidebar |

The panel never fabricates a successful response. Only a 2xx JSON answer that
passes the client-side shape check becomes the connected state; transport,
HTTP, timeout, and shape failures surface as errors and keep any previous data
marked stale.

## Response fields

| Field | Meaning |
|---|---|
| `schema_version` | Wire version, currently `1` |
| `product` | Literal `KnowledgeOS` |
| `upstream_commit` | Commit the running Host build recorded, or `unknown` |
| `upstream_version` | Version of the running DSH build, or `unknown` |
| `expected_upstream_commit` | Commit this checkout pins (`39163dd…`) |
| `upstream_commit_verified` | `true` / `false` / `null` (commit unknown) |
| `host_instance_id` | Random opaque id for this plugin instance; a Host restart changes it |
| `started_at` | ISO time this plugin instance started |
| `checked_at` | ISO time the Host answered this query |
| `status` | `ok`; states this read-only service, not future modules |

Nothing in the response names a credential, cookie, environment variable,
absolute path, file, account, or session.

## Build

The committed `lib/` is what the profile installs. To rebuild from source:

```powershell
cd packages/knowledgeos-panel
npm install
node build.mjs
npx tsc -p tsconfig.json
```

`build.mjs` emits the Host ESM entry and a DSH closure-factory client bundle:
the client artifact calls `window.__ModuleLoader__.load({ id, factory })` and
resolves only the shell's shared `react` modules through the factory's
`require`. It is not a standalone Vite page.

## Install into an isolated profile

Use the fixed source checkout that matches `config/upstream.lock.json`; do not
assume a globally installed `dsh` has that version.

```powershell
$knowledgeosRepo = "<path-to-this-repository>"
$dshRoot = "$knowledgeosRepo\.cache\build\dsh-39163dd"
$dshTestHome = "$knowledgeosRepo\.cache\dsh-home-fnd001"
$env:DSH_HOME = $dshTestHome
# Source launch contract: the checked-out fixed commit, not an arbitrary value.
$env:DSH_CLIENT_COMMIT_HASH = "39163dd30f703a79079e2d2446545cff3c453738"

# First creation only: initializes the profile from the shipped web template.
# Do not repeat this on later runs; it would replace the existing profile.
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --from-default-profile web --dump-config

# Install this checkout into the profile.
node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-test add "$knowledgeosRepo\packages\knowledgeos-panel"

# Run the fixed source build. No extra `web` positional: with an explicit
# profile the remaining tokens are app arguments, and a stray `web` is rejected.
cd $dshRoot
node --import tsx/esm apps/cli/src/bin.ts --profile knowledgeos-test --port 3099 --no-open
```

Remove the bundle with the same CLI and restart the test Host:

```powershell
node --import tsx/esm apps/cli/src/bin.ts plugin --profile knowledgeos-test remove knowledgeos-panel
```

The bundle's `cordis.patch.yml` inserts one Host row; removing the bundle
removes both halves at the next Host start.
