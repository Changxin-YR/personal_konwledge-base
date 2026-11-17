/**
 * Sidebar glyph for the KnowledgeOS entry.
 *
 * The sidebar owns the button, label, and selected state; this component only
 * draws the glyph at the requested size and inherits the row's color.
 */

import type { JSX } from 'react'

/** Props the sidebar passes to one panel-list icon. */
export interface KnowledgeOsPanelIconProps {
  /** Edge length in pixels requested by the sidebar. */
  readonly size?: number
}

/**
 * Draw the KnowledgeOS glyph.
 * @param props - requested icon size.
 * @returns the SVG element.
 */
export function KnowledgeOsPanelIcon({ size = 20 }: KnowledgeOsPanelIconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4.5 5.25c2.8-.9 5.2-.55 7.5.9 2.3-1.45 4.7-1.8 7.5-.9v12.2c-2.8-.9-5.2-.55-7.5.9-2.3-1.45-4.7-1.8-7.5-.9V5.25Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 6.15v12.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.2 9.1c1.1-.2 2.1-.05 3.1.45M7.2 12.2c1.1-.2 2.1-.05 3.1.45M13.7 9.55c1-.5 2-.65 3.1-.45M13.7 12.65c1-.5 2-.65 3.1-.45"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
