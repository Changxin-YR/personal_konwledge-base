/**
 * Browser half of the KnowledgeOS FND-001 bundle.
 *
 * It contributes exactly one global main panel and one sidebar entry. Both
 * registrations are owned by this plugin fiber: `ctx.slots.inject` removes
 * them when the declaration it waits for collapses, and the fiber removes them
 * on unload.
 */
import type { BrowserContext, Disposer } from './contracts.ts'
import { KnowledgeOsPanel } from './Panel.tsx'
import { KnowledgeOsPanelIcon } from './icon.tsx'

/** Sidebar entry id; also the key of the main panel it selects. */
export const PANEL_ID = 'knowledgeos'

/** Services required to register the panel and its entry. */
export const inject = ['slots']

/**
 * Register the KnowledgeOS main panel and sidebar entry.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: BrowserContext): void {
  ctx.slots.inject('main', function* (): Generator<Disposer> {
    yield ctx.slots.register({ name: 'main', key: PANEL_ID }, KnowledgeOsPanel)
  })
  ctx.slots.inject('sidebar.panellist', function* (): Generator<Disposer> {
    yield ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 20,
      label: () => '知识库',
    }, KnowledgeOsPanelIcon)
  })
}
