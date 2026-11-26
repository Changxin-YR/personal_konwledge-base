import type { IncomingMessage, ServerResponse } from 'node:http'
import { AiError } from './ai-tools.ts'
import { AssetError } from './asset-store.ts'
import { UUID_PATTERN } from './http.ts'
import type { PeerScope } from './identity-peer.ts'
import type { SessionActor } from './identity.ts'
import { normalizeFill, questionKinds, type Answer, type QuestionKind } from './practice-policy.ts'
import type { ReviewDraft } from './practice-review.ts'
import type { AttemptInput, CorrectionInput, PracticeStore, QuestionDraft } from './practice-store.ts'
import type { QuickInput, QuickPracticeService } from './quick-practice.ts'

export const questionApi = '/knowledge/v1/questions'
export const practiceApi = '/knowledge/v1/practice-sessions'
export const reviewApi = '/knowledge/v1/me/wrong-questions'
export const stateApi = '/knowledge/v1/me/question-states'
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

function correctionInput(raw:unknown):CorrectionInput{
  const input=fields(raw,['expected_version','answer','explanation','reason'])
  const expected_version=sequence(input.expected_version)
  if(expected_version<1)throw invalid()
  let answer:Answer|Answer[]
  if(Array.isArray(input.answer))answer=distinct(input.answer,12,value=>text(value,320),normalizeFill)
  else if(typeof input.answer==='boolean'||typeof input.answer==='number'&&Number.isSafeInteger(input.answer))answer=input.answer
  else throw invalid()
  return {expected_version,answer,explanation:text(input.explanation,4000),reason:text(input.reason,1000)}
}

function reviewInput(raw:unknown):ReviewDraft{
  const input=fields(raw,['expected_revision','wrong_reason','mastery_state','next_review_at'])
  const draft:ReviewDraft={expected_revision:sequence(input.expected_revision)}
  if(Object.keys(input).length<2)throw invalid()
  if('wrong_reason' in input){
    if(typeof input.wrong_reason!=='string'||input.wrong_reason.length>1000||input.wrong_reason.includes('\0'))throw invalid()
    draft.wrong_reason=input.wrong_reason.trim()
  }
  if('mastery_state' in input){
    const mastery=input.mastery_state
    if(mastery!=='new'&&mastery!=='reviewing'&&mastery!=='mastered')throw invalid()
    draft.mastery_state=mastery
  }
  if('next_review_at' in input){
    const date=input.next_review_at
    if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(date)||!Number.isFinite(Date.parse(date))))throw invalid()
    draft.next_review_at=date===null?null:new Date(date).toISOString()
  }
  return draft
}

function quickInput(raw: unknown, preview: boolean) {
  const value=fields(raw,['scope','asset_id','version_id','ordinal','conversion_id','start','end','source_hash','count','units',...(preview?[]:['fingerprint'])])
  const {scope}=value
  if(scope!=='paragraph'&&scope!=='chapter'&&scope!=='term')throw invalid()
  const count=sequence(value.count),ordinal=sequence(value.ordinal)
  const units=value.units===undefined?(scope==='chapter'?4:1):sequence(value.units)
  if(count<1||count>4||ordinal<1||ordinal>1_000_000||units<1||units>6||scope!=='chapter'&&units!==1)throw invalid()
  const input:QuickInput={scope,count,units,ordinal,asset_id:uuid(value.asset_id),version_id:uuid(value.version_id)}
  if(value.conversion_id!==undefined)input.conversion_id=uuid(value.conversion_id)
  if(scope==='chapter'){
    if(['start','end','source_hash'].some(key=>Object.hasOwn(value,key)))throw invalid()
  }else{
    const start=sequence(value.start),end=sequence(value.end)
    if(end<=start||typeof value.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(value.source_hash))throw invalid()
    input.selection={start,end,source_hash:value.source_hash}
  }
  const fingerprint=value.fingerprint
  if(!preview&&(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint)))throw invalid()
  return {input,fingerprint:fingerprint as string}
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

export function createPracticeHandler(store: PracticeStore, quick: QuickPracticeService, origin: () => string | undefined,
  actorFor: (req: IncomingMessage) => SessionActor | undefined, stopping:AbortSignal) {
  return async (req: IncomingMessage, res: ServerResponse, peer?:PeerScope) => {
    const disconnected=new AbortController()
    const close=()=>{if(!res.writableFinished)disconnected.abort()}
    res.once('close',close)
    const signal=AbortSignal.any([disconnected.signal,stopping,...(peer?.signal?[peer.signal]:[])])
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
      const current=()=>{
        const actor=actorFor(req)
        if(!actor||actor.sessionId!==prior.sessionId||actor.userId!==prior.userId||actor.serviceId!==prior.serviceId)
          throw new AssetError(401,'AUTH_REQUIRED')
        return actor
      }
      const success = (status: number, value: object) => send(status, { data: { actor_id: prior.userId, ...value } })
      const path = url.pathname
      const preview=path===practiceApi+'/generate/preview', generate=path===practiceApi+'/generate'
      const session=path.startsWith(practiceApi+'/')&&/^\/([a-f0-9-]+)\/(questions|attempts|hints|disputes)$/.exec(path.slice(practiceApi.length))
      const correction=path.startsWith(questionApi+'/')&&/^\/([a-f0-9-]+)\/corrections$/.exec(path.slice(questionApi.length))
      const state=path.startsWith(stateApi+'/')&&/^\/([a-f0-9-]+)$/.exec(path.slice(stateApi.length))
      if (method === 'GET') {
        if (path === questionApi) return success(200, store.catalog(prior))
        if (path === practiceApi) return success(200, { sessions: store.listSessions(prior) })
        if(path===reviewApi)return success(200,store.review(prior))
        const author = path.startsWith(questionApi + '/') && /^\/([a-f0-9-]+)\/author$/.exec(path.slice(questionApi.length))
        if (author) return success(200, store.authored(prior, uuid(author[1])))
        if (session && session[2] === 'questions') return success(200, store.questions(prior, uuid(session[1])))
      }
      const post=method==='POST'&&(preview||generate||path===questionApi||path===practiceApi||correction||session&&session[2]!=='questions')
      if(post||method==='PATCH'&&state){
        if (uuid(req.headers['x-knowledgeos-reader-actor']) !== prior.userId) throw new AssetError(409, 'ACTOR_CHANGED')
        const body=await json(req)
        if(res.destroyed)return
        if(signal.aborted)throw new AiError(409,'CANCELLED')
        if(preview){
          const {input}=quickInput(body,true)
          return success(200,await quick.preview(current,input,signal))
        }
        const key=uuid(req.headers['idempotency-key']),actor=current()
        const recorded = (output: { replayed: boolean }) => success(output.replayed ? 200 : 201, output)
        if(method==='PATCH'&&state)return success(200,store.updateReview(actor,key,uuid(state[1]),reviewInput(body)))
        if(correction)return recorded(store.correct(actor,key,uuid(correction[1]),correctionInput(body)))
        if(generate){
          const {input,fingerprint}=quickInput(body,false)
          return recorded(await quick.generate(current,key,input,fingerprint,signal))
        }
        if (path === questionApi) return recorded(store.createQuestion(actor, key, questionDraft(body)))
        if (path === practiceApi) {
          const { question_version_ids } = fields(body, ['question_version_ids'])
          return recorded(store.createSession(actor, key, distinct(question_version_ids, 20, uuid, id => id)))
        }
        if(session){
          const id=uuid(session[1])
          if(session[2]==='hints'){
            const input=fields(body,['question_version_id','level'])
            if(input.level!==1&&input.level!==2)throw invalid()
            return recorded(store.hint(actor,key,id,uuid(input.question_version_id),input.level))
          }
          if(session[2]==='disputes'){
            const input=fields(body,['question_version_id','reason'])
            return recorded(store.dispute(actor,key,id,uuid(input.question_version_id),text(input.reason,1000)))
          }
          return recorded(store.submit(actor,key,id,attemptInput(body)))
        }
      }
      throw new AssetError(404, 'NOT_FOUND')
    } catch (error) {
      const known=error instanceof AssetError||error instanceof AiError
      send(known?error.status:503,{code:known?error.code:'PRACTICE_UNAVAILABLE'})
    }finally{res.off('close',close)}
  }
}
