/** Minimal browser-side Cordis surface this bundle consumes. */

/** Removes one registration when the owning plugin unloads. */
export type Disposer = () => void

/** Options accepted by the slot registrations this bundle uses. */
export interface SlotRegistration {
  /** Slot name declared by its owner package. */
  readonly name: string
  /** Key for a keyed slot such as `main`. */
  readonly key?: string
  /** Identity for a list slot such as `sidebar.panellist`. */
  readonly id?: string
  /** Order among sidebar entries. */
  readonly order?: number
  /** Label the sidebar reads for its row. */
  readonly label?: () => string
}

/** The slot service subset: wait for a declaration, then register. */
export interface SlotService {
  inject(name: string, contribution: () => Disposer | Generator<Disposer>): Disposer | void
  register(options: SlotRegistration, component: unknown): Disposer
}

/** Browser plugin context used by the KnowledgeOS panel. */
export interface BrowserContext {
  readonly slots: SlotService
  effect(effect: () => Disposer, label?: string): void
}
