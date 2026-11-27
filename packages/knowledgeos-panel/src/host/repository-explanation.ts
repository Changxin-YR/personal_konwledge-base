import { CODE_EXPLANATION_SYSTEM, codeQuestion, groundedExplanation, lineRange, sourceWindow, type LineRange } from '../domain/code-explanation.ts'
import { groundedModuleExplanation, MODULE_EXPLANATION_SYSTEM, moduleSourceRequests, moduleSourceWindow, type ModuleSourceRequest, type ModuleSourceWindow } from '../domain/module-explanation.ts'
import type { SessionActor } from './identity.ts'
import type { AiService } from './ai-service.ts'
import { AssetError } from './asset-store.ts'
import { badRepository, isRepositoryPath, sha40 } from './github-repository.ts'
import type { RepositoryEntry } from './github-repository.ts'
import type { RepositoryStore } from './repository-store.ts'

const sha = (value: unknown) => {
  if (typeof value !== 'string' || !sha40.test(value)) throw badRepository()
  return value
}
export function codeLocation(input: Record<string, unknown>) {
  if (!isRepositoryPath(input.path)) throw badRepository()
  return { path: input.path, commit: sha(input.commit), blob_sha: sha(input.blob_sha), ...lineRange(input.start_line, input.end_line) }
}
export type CodeLocation = LineRange & { path: string; commit: string; blob_sha: string }
type SourceStore = Pick<RepositoryStore, 'file'>
type ModuleStore = Pick<RepositoryStore, 'detail' | 'file'>

function readSource(store: SourceStore, actor: SessionActor, expected: string, snapshot: string, location: CodeLocation) {
  const file = store.file(actor, snapshot, location.path, expected)
  if (file.commit !== location.commit || file.sha !== location.blob_sha) throw new AssetError(409, 'CODE_SOURCE_CHANGED')
  return sourceWindow(file.text, location)
}

export function readCodeCitation(store: SourceStore, actor: SessionActor, snapshot: string, location: CodeLocation) {
  const { lines } = readSource(store, actor, actor.userId, snapshot, location)
  return { snapshot_id: snapshot, ...location, quote: lines.map(line => line.text).join('\n') }
}

export async function explainPinnedCode(store: SourceStore, ai: Pick<AiService, 'explainSelection'>, current: () => SessionActor,
  expected: string, snapshot: string, location: CodeLocation, questionInput: unknown, signal: AbortSignal) {
  const actor = current(), question = codeQuestion(questionInput)
  const read = () => {
    if (signal.aborted) throw new AssetError(409, 'CANCELLED')
    const live = current()
    if (live.sessionId !== actor.sessionId || live.serviceId !== actor.serviceId || live.userId !== actor.userId) throw new AssetError(401, 'AUTH_REQUIRED')
    return readSource(store, live, expected, snapshot, location)
  }
  const source = read()
  if (!source.lines.some(line => line.text.trim())) throw new AssetError(422, 'CODE_TEXT_REQUIRED')
  const packet = JSON.stringify({ path: location.path, question, lines: source.lines })
  const authorize = () => {
    const checked = read()
    if (checked.total_lines !== source.total_lines || checked.lines.some((line, index) => line.text !== source.lines[index]?.text)) throw new AssetError(409, 'CODE_SOURCE_CHANGED')
  }
  const response = await ai.explainSelection(actor, CODE_EXPLANATION_SYSTEM, packet, signal, authorize)
  authorize()
  const answer = groundedExplanation(response.text, source)
  return { source: { snapshot_id: snapshot, ...location, total_lines: source.total_lines }, ...answer, provider: response.provider, model: response.model }
}

function moduleRequest(value: ModuleSourceRequest) {
  if (!isRepositoryPath(value.path)) throw badRepository()
  return value
}

function readModuleSource(store: ModuleStore, actor: SessionActor, expected: string, snapshot: string, request: ModuleSourceRequest, commit: string): ModuleSourceWindow {
  const file = store.file(actor, snapshot, request.path, expected)
  if (file.commit !== commit) throw new AssetError(409, 'CODE_SOURCE_CHANGED')
  const window = moduleSourceWindow(file.text, request)
  if (!window.lines.some(line => line.text.trim())) throw new AssetError(422, 'MODULE_TEXT_REQUIRED')
  return { path: request.path, commit: file.commit, blob_sha: file.sha, ...window }
}

function treeFacts(entries: readonly RepositoryEntry[]) {
  return entries.map(entry => ({ path: entry.path, kind: entry.kind, size: entry.size }))
}

export async function explainPinnedModule(store: ModuleStore, ai: Pick<AiService, 'explainSelection'>, current: () => SessionActor,
  expected: string, snapshot: string, sourcesInput: unknown, questionInput: unknown, signal: AbortSignal) {
  const actor = current(), question = codeQuestion(questionInput)
  const requests = moduleSourceRequests(sourcesInput).map(moduleRequest)
  const read = () => {
    if (signal.aborted) throw new AssetError(409, 'CANCELLED')
    const live = current()
    if (live.sessionId !== actor.sessionId || live.serviceId !== actor.serviceId || live.userId !== actor.userId) throw new AssetError(401, 'AUTH_REQUIRED')
    const detail = store.detail(live, snapshot)
    const sources = requests.map(request => readModuleSource(store, live, expected, snapshot, request, detail.snapshot.commit))
    return { detail, sources }
  }
  const initial = read()
  const packet = JSON.stringify({
    commit: initial.detail.snapshot.commit,
    tree: treeFacts(initial.detail.entries),
    sources: initial.sources.map(source => ({ path: source.path, commit: source.commit, blob_sha: source.blob_sha, start_line: source.start_line,
      end_line: source.end_line, total_lines: source.total_lines, lines: source.lines })),
    question,
  })
  const authorize = () => {
    const checked = read()
    if (checked.detail.snapshot.commit !== initial.detail.snapshot.commit || checked.detail.snapshot.tree !== initial.detail.snapshot.tree) throw new AssetError(409, 'CODE_SOURCE_CHANGED')
    if (checked.sources.some((source, index) => source.blob_sha !== initial.sources[index]?.blob_sha || source.total_lines !== initial.sources[index]?.total_lines ||
      source.lines.some((line, lineIndex) => line.text !== initial.sources[index]?.lines[lineIndex]?.text))) throw new AssetError(409, 'CODE_SOURCE_CHANGED')
  }
  const response = await ai.explainSelection(actor, MODULE_EXPLANATION_SYSTEM, packet, signal, authorize)
  authorize()
  const answer = groundedModuleExplanation(response.text, initial.sources)
  return {
    snapshot_id: snapshot,
    commit: initial.detail.snapshot.commit,
    tree: initial.detail.snapshot.tree,
    sources: initial.sources.map(source => ({ path: source.path, commit: source.commit, blob_sha: source.blob_sha, start_line: source.start_line,
      end_line: source.end_line, total_lines: source.total_lines })),
    ...answer,
    provider: response.provider,
    model: response.model,
  }
}
