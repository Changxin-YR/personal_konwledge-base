/**
 * Trusted Host configuration for the KnowledgeOS foundation slice.
 *
 * `dataDir` is deployment configuration from the plugin row, never an HTTP
 * parameter. Omitting it keeps the read-only status panel working while the
 * persistence endpoints report storage as unavailable.
 */
import { isAbsolute } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

/** Plugin configuration accepted from the `knowledgeos-host` Cordis row. */
export interface Config {
  /**
   * Absolute local directory holding `knowledgeos.sqlite`. No default is
   * guessed from cwd, HOME, the build tree, or a request.
   */
  dataDir?: string
  /** Trusted deployment route and advisory budget; never accepted from HTTP/model. */
  ai?: import('./ai-service.ts').AiConfig
  repositoryCredentials?: import('./repository-store.ts').RepositoryCredentialBinding[]
}

/** Cordis validates the row config against this schema before `apply`. */
export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string(),
  repositoryCredentials: Schema.array(Schema.object({
    actorId: Schema.string().required(), repository: Schema.string().required(), alias: Schema.string().required(), credentialRef: Schema.string().required(),
    platform: Schema.union(['github', 'gitlab', 'gitee'] as const),
  })),
  ai: Schema.object({ provider: Schema.string(), model: Schema.string(), maxCalls: Schema.number().min(1), timeoutMs: Schema.number().min(20).max(60000), budgetUsd: Schema.number().min(0), inputUsdPerMillion: Schema.number().min(0), outputUsdPerMillion: Schema.number().min(0) }),
})

/**
 * Validate and return the configured database directory.
 * @param config - validated plugin config.
 * @returns the absolute directory, or undefined when storage is not configured.
 * @throws {Error} when a configured path is not absolute.
 */
export function resolveDataDir(config: Config): string | undefined {
  if (config.dataDir === undefined) return undefined
  if (config.dataDir.length === 0) throw new Error('knowledgeos-panel: config.dataDir must not be empty')
  if (!isAbsolute(config.dataDir)) {
    throw new Error('knowledgeos-panel: config.dataDir must be an absolute local path')
  }
  return config.dataDir
}
