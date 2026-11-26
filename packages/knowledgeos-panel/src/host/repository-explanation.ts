import { CODE_EXPLANATION_SYSTEM, codeQuestion, groundedExplanation, lineRange, sourceWindow, type LineRange } from '../domain/code-explanation.ts'
import type { SessionActor } from './identity.ts'
import type { AiService } from './ai-service.ts'
import { AssetError } from './asset-store.ts'
import { badRepository, isRepositoryPath, sha40 } from './github-repository.ts'
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
