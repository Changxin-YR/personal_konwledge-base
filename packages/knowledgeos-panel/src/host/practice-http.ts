import type { IncomingMessage, ServerResponse } from 'node:http'
import { AssetError } from './asset-store.ts'
import { UUID_PATTERN } from './http.ts'
import type { SessionActor } from './identity.ts'
import { normalizeFill, questionKinds, type Answer, type QuestionKind } from './practice-policy.ts'
import type { AttemptInput, PracticeStore, QuestionDraft } from './practice-store.ts'

export const questionApi = '/knowledge/v1/questions'
export const practiceApi = '/knowledge/v1/practice-sessions'
const invalid = () => new AssetError(422, 'INVALID_PRACTICE_INPUT')

function fields(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid()
  return value as Record<string, unknown>
}

function uuid(value: unknown) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw invalid()
  return value
}

function text(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) throw invalid()
  return value.trim()
}

function sequence(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw invalid()
  return value
}

function distinct<T>(value: unknown, max: number, parse: (value: unknown) => T, key: (value: T) => string) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) throw invalid()
  const items = value.map(parse)
  if (new Set(items.map(key)).size !== items.length) throw invalid()
  return items
}

function questionDraft(raw: unknown): QuestionDraft {
  const values = fields(raw, ['kind','prompt','options','answer','explanation','source_citation_id','project_id'])
  const kind = values.kind as QuestionKind
  if (!questionKinds.includes(kind)) throw invalid()
  const prompt = text(values.prompt, 2000), explanation = text(values.explanation, 4000)
  const source_citation_id = uuid(values.source_citation_id), project_id = values.project_id === undefined || values.project_id === null ? null : uuid(values.project_id)
  let options: string[] = [], accepted: Answer[]
  if (kind === 'choice') {
    options = distinct(values.options, 8, value => text(value, 500), normalizeFill)
    const answer = sequence(values.answer)
    if (options.length < 2 || answer < 1 || answer > options.length) throw invalid()
    accepted = [answer]
  } else {
    if (values.options !== undefined) throw invalid()
    if (kind === 'judgment') {
      if (typeof values.answer !== 'boolean') throw invalid()
      accepted = [values.answer]
    } else accepted = distinct(values.answer, 12, value => text(value, 320), normalizeFill)
  }
  return { kind, prompt, options, accepted, explanation, source_citation_id, project_id }
}

function attemptInput(raw: unknown): AttemptInput {
  const values = fields(raw, ['question_version_id','expected_sequence','answer','confidence'])
  const { answer, confidence } = values
  if (confidence !== 'sure' && confidence !== 'unsure') throw invalid()
  if (typeof answer === 'string') text(answer, 500)
  else if (typeof answer !== 'boolean' && (typeof answer !== 'number' || !Number.isSafeInteger(answer))) throw invalid()
  return { question_version_id: uuid(values.question_version_id), expected_sequence: sequence(values.expected_sequence), answer, confidence }
}

async function json(req: IncomingMessage) {
  const max = 24000, parts: Buffer[] = []
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AssetError(415, 'JSON_REQUIRED')
  if (Number(req.headers['content-length']) > max) throw new AssetError(413, 'BODY_TOO_LARGE')
  let length = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > max) { req.resume(); throw new AssetError(413, 'BODY_TOO_LARGE') }
    parts.push(bytes)
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, length))) as unknown }
  catch { throw invalid() }
}

export function createPracticeHandler(store: PracticeStore, origin: () => string | undefined, actorFor: (req: IncomingMessage) => SessionActor | undefined) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: object) => {
      if (res.destroyed) return
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end(JSON.stringify(body))
    }
    try {
      const base = origin(), method = req.method
      if (!base || req.headers.host !== new URL(base).host || req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin !== undefined && req.headers.origin !== base) || (method !== 'GET' && req.headers['x-knowledgeos-request'] !== '1'))
        throw new AssetError(403, 'CSRF_REJECTED')
      const url = new URL(req.url ?? '/', base)
      if (url.origin !== base) throw new AssetError(403, 'CSRF_REJECTED')
      if (url.search) throw invalid()
      const prior = actorFor(req)
      if (!prior) throw new AssetError(401, 'AUTH_REQUIRED')
      const success = (status: number, value: object) => send(status, { data: { actor_id: prior.userId, ...value } })
      const path = url.pathname
      const session = path.startsWith(practiceApi + '/') && /^\/([a-f0-9-]+)\/(questions|attempts)$/.exec(path.slice(practiceApi.length))
      if (method === 'GET') {
        if (path === questionApi) return success(200, store.catalog(prior))
        if (path === practiceApi) return success(200, { sessions: store.listSessions(prior) })
        const author = path.startsWith(questionApi + '/') && /^\/([a-f0-9-]+)\/author$/.exec(path.slice(questionApi.length))
        if (author) return success(200, store.authored(prior, uuid(author[1])))
        if (session && session[2] === 'questions') return success(200, store.questions(prior, uuid(session[1])))
      }
      if (method === 'POST' && (path === questionApi || path === practiceApi || session && session[2] === 'attempts')) {
        if (uuid(req.headers['x-knowledgeos-reader-actor']) !== prior.userId) throw new AssetError(409, 'ACTOR_CHANGED')
        const key = uuid(req.headers['idempotency-key']), body = await json(req)
        if (res.destroyed) return
        const actor = actorFor(req)
        if (!actor || actor.sessionId !== prior.sessionId || actor.userId !== prior.userId || actor.serviceId !== prior.serviceId)
          throw new AssetError(401, 'AUTH_REQUIRED')
        const recorded = (output: { replayed: boolean }) => success(output.replayed ? 200 : 201, output)
        if (path === questionApi) return recorded(store.createQuestion(actor, key, questionDraft(body)))
        if (path === practiceApi) {
          const { question_version_ids } = fields(body, ['question_version_ids'])
          return recorded(store.createSession(actor, key, distinct(question_version_ids, 20, uuid, id => id)))
        }
        if (session) return recorded(store.submit(actor, key, uuid(session[1]), attemptInput(body)))
      }
      throw new AssetError(404, 'NOT_FOUND')
    } catch (error) {
      send(error instanceof AssetError ? error.status : 503, { code: error instanceof AssetError ? error.code : 'PRACTICE_UNAVAILABLE' })
    }
  }
}
