import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ProbeStorage, readDatabaseFacts, authorize } from '../../packages/knowledgeos-panel/lib/test-support.js'

const outIndex = process.argv.indexOf('--out')
const out = outIndex >= 0 ? (process.argv[outIndex + 1] ?? 'docs/evidence/FND-004/runs/local') : 'docs/evidence/FND-004/runs/local'
mkdirSync(out, { recursive: true })
const dataDir = join(out, 'data')
const now = '2026-11-17T12:00:00.000Z'
const later = '2026-11-18T12:00:00.000Z'
const credential = seed => ({ algorithm: 'scrypt', version: 1, n: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024, salt: Buffer.alloc(16, seed), derivedKey: Buffer.alloc(32, seed + 1) })
const checks = []
const check = (id, fn) => { try { fn(); checks.push({ id, status: 'PASS' }) } catch (error) { checks.push({ id, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }) } }
const assert = (value, message) => { if (!value) throw new Error(message) }

const storage = new ProbeStorage({ dataDir })
try {
  assert(storage.available, `storage unavailable: ${storage.failure?.message}`)
  const setup = storage.getSetupState()
  const admin = storage.bootstrap({ loginName: 'admin', displayName: '管理员', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now, credential: credential(1) }).user
  const alice = storage.register({ loginName: 'alice', displayName: '甲', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now, credential: credential(2) }).user
  const bob = storage.register({ loginName: 'bob', displayName: '乙', timezone: 'Asia/Shanghai', domains: [], learningTracks: [], goalText: '', now, credential: credential(3) }).user
  const adminActor = { sessionId: 's-admin', userId: admin.id, role: 'admin', serviceId: setup.serviceId, personalSpaceId: admin.personalSpaceId }
  const aliceActor = { sessionId: 's-alice', userId: alice.id, role: 'member', serviceId: setup.serviceId, personalSpaceId: alice.personalSpaceId }
  const bobActor = { sessionId: 's-bob', userId: bob.id, role: 'member', serviceId: setup.serviceId, personalSpaceId: bob.personalSpaceId }

  const aliceObject = storage.createObject({ id: 'obj-alice', serviceId: setup.serviceId, spaceId: alice.personalSpaceId, scope: 'personal', ownerUserId: alice.id, objectType: 'note', title: '甲的私有对象', body: '甲的正文', now })
  const bobObject = storage.createObject({ id: 'obj-bob', serviceId: setup.serviceId, spaceId: bob.personalSpaceId, scope: 'personal', ownerUserId: bob.id, objectType: 'note', title: '乙的私有对象', body: '乙的正文', now })
  check('FND-004-T01', () => { assert(storage.authorizeObject(aliceActor, aliceObject.id, 'read', now)?.body === '甲的正文', 'owner read failed'); assert(storage.authorizeObject(bobActor, aliceObject.id, 'read', now) === undefined, 'cross-user read allowed'); assert(storage.listObjects(bobActor, 'read', now).every(item => item.id !== aliceObject.id), 'cross-user list leaked'); assert(storage.authorizeObject(adminActor, bobObject.id, 'read', now) === undefined, 'admin label read allowed') })
  check('FND-004-T02', () => { for (const action of ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records']) assert(storage.authorizeObject(aliceActor, aliceObject.id, action, now)?.id === aliceObject.id, `${action} denied for owner`); const other = { ...bobActor, userId: 'forged-user' }; assert(storage.authorizeObject(other, aliceObject.id, 'read', now) === undefined, 'forged actor allowed') })

  const project = storage.createProject({ id: 'project-1', serviceId: setup.serviceId, ownerUserId: alice.id, name: '最小项目', now })
  storage.addProjectMembership({ projectId: project.id, userId: bob.id, role: 'member', validFrom: now, expiresAt: later })
  const projectObject = storage.createObject({ id: 'obj-project', serviceId: setup.serviceId, spaceId: alice.personalSpaceId, scope: 'project', projectId: project.id, ownerUserId: alice.id, objectType: 'note', title: '项目对象', body: '项目正文', now })
  check('FND-004-T03', () => { assert(storage.authorizeObject(bobActor, projectObject.id, 'read', now) === undefined, 'membership implied read'); const grant = storage.grantObject(aliceActor, { id: 'grant-read', objectId: projectObject.id, serviceId: setup.serviceId, subjectType: 'user', subjectId: bob.id, action: 'read', validFrom: now, now }); assert(grant?.action === 'read', 'read grant missing'); assert(storage.authorizeObject(bobActor, projectObject.id, 'read', now)?.id === projectObject.id, 'read grant failed'); assert(storage.authorizeObject(bobActor, projectObject.id, 'edit', now) === undefined, 'read grant implied edit'); storage.grantObject(aliceActor, { id: 'grant-edit-now', objectId: projectObject.id, serviceId: setup.serviceId, subjectType: 'user', subjectId: bob.id, action: 'edit', validFrom: now, now }); assert(storage.authorizeObject(bobActor, projectObject.id, 'edit', now)?.id === projectObject.id, 'edit grant failed'); assert(storage.authorizeObject(bobActor, projectObject.id, 'delete', now) === undefined, 'edit implied delete'); assert(storage.authorizeObject(bobActor, projectObject.id, 'manage_share', now) === undefined, 'edit implied manage_share') })
  check('FND-004-T04', () => { const expired = storage.grantObject(aliceActor, { id: 'grant-comment-future', objectId: projectObject.id, serviceId: setup.serviceId, subjectType: 'user', subjectId: bob.id, action: 'comment', validFrom: later, expiresAt: later, now }); assert(expired, 'expired grant insert failed'); assert(storage.authorizeObject(bobActor, projectObject.id, 'comment', now) === undefined, 'future grant active'); storage.grantObject(aliceActor, { id: 'grant-export', objectId: projectObject.id, serviceId: setup.serviceId, subjectType: 'user', subjectId: bob.id, action: 'export', validFrom: now, expiresAt: later, now }); assert(storage.authorizeObject(bobActor, projectObject.id, 'export', later) === undefined, 'expiry boundary allowed'); assert(storage.revokeGrant(aliceActor, 'grant-read', now), 'revoke failed'); assert(storage.authorizeObject(bobActor, projectObject.id, 'read', now) === undefined, 'revoked grant still active') })
  check('FND-004-T05', () => { const facts = readDatabaseFacts(storage.databasePath); assert(facts.userVersion === 3, 'v3 not active'); assert(facts.ledger.length === 3, 'migration ledger incomplete'); storage.close(); const reopened = new ProbeStorage({ dataDir }); assert(reopened.available, 'reopen failed'); assert(reopened.authorizeObject(aliceActor, aliceObject.id, 'read', now)?.id === aliceObject.id, 'object state lost on restart'); reopened.close() })
  check('FND-004-T06', () => { assert(authorize(aliceActor, { serviceId: setup.serviceId, spaceId: alice.personalSpaceId, objectId: aliceObject.id, scope: 'personal', ownerUserId: alice.id, status: 'active' }, 'edit', now), 'domain authorize owner'); assert(!authorize(bobActor, { serviceId: setup.serviceId, spaceId: alice.personalSpaceId, objectId: aliceObject.id, scope: 'personal', ownerUserId: alice.id, status: 'active' }, 'read', now), 'domain authorize default deny') })
  check('FND-004-T07', () => { for (const file of ['packages/knowledgeos-panel/lib/index.js', 'packages/knowledgeos-panel/lib/storage.js', 'packages/knowledgeos-panel/lib/test-support.js']) assert(existsSync(file), `missing build artifact ${file}`); const source = readFileSync('packages/knowledgeos-panel/src/host/index.ts', 'utf8'); for (const route of ['/knowledge/v1/objects', '/knowledge/v1/projects', '/knowledge/v1/grants']) assert(source.includes(route), `missing route ${route}`) })
} finally { try { storage.close() } catch {} }

const summary = { status: checks.some(item => item.status === 'FAIL') ? 'FAIL' : 'PASS', checks, not_run: ['search_index', 'ai_summary', 'file_download', 'invite_redemption', 'full_cache_invalidation', 'complete_A02_A34_A46'] }
console.log(JSON.stringify(summary, null, 2))
const fs = await import('node:fs/promises')
await fs.writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
await fs.rm(dataDir, { recursive: true, force: true })
if (summary.status === 'FAIL') process.exitCode = 1
