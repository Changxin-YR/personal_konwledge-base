/**
 * Minimal declarations for the Cordis Host services this bundle consumes.
 *
 * The real signatures live in the pinned DSH packages; this bundle is built
 * and type-checked out of tree, so only the used surface is declared here.
 */
declare module '@deepseek-ai/cordis' {
  /** One named HTTP route with its own response lifecycle. */
  export interface WebRoute {
    kind: 'exact' | 'prefix'
    path: string
    auth?: 'anonymous' | 'required' | 'deny'
    handler: (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
      peer?: unknown,
    ) => void | Promise<void>
  }

  /** One named Web route answered by a Fetch resource. */
  export interface WebResourceRoute {
    kind: 'exact' | 'prefix'
    path: string
    auth?: 'anonymous' | 'required' | 'deny'
    resource: (request: Request, peer?: unknown) => Promise<Response>
  }

  /** Web carrier service mounted by the Web profile. */
  export interface WebServer {
    readonly host?: string
    readonly port?: number
    readonly protocol?: 'http:' | 'https:'
    getOrigin?: () => string
    register(route: WebRoute | WebResourceRoute): () => void
  }

  /** Release identity the running Host publishes to client modules. */
  export interface HostReleaseInfo {
    version: string
    commit?: string
  }

  /** Client-module registry service owned by the Web composition. */
  export interface ClientModules {
    graph(): { release?: HostReleaseInfo }
  }

  /** Minimal live Connection service surface required by the identity routes. */
  export interface HostConnection {
    browserPeer: { signal: AbortSignal }
    authentication?: unknown
  }

  /** Host plugin context subset used by this bundle's Host half. */
  export interface Context {
    webServer: WebServer
    clientModules: ClientModules
    connection: HostConnection
    inject<T extends readonly string[]>(services: T, callback: (scope: Context) => void): void
    effect(effect: () => (() => void) | Promise<void>, label?: string): void
  }
}
