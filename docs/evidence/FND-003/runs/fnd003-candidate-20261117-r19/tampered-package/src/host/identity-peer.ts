/** Minimal structural view of the fixed DSH admitted peer used by bootstrap. */
export interface PeerScope {
  readonly principal?: { readonly kind?: string }
  readonly signal?: AbortSignal
}
