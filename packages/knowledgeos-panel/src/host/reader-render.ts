import { openReaderPdf } from './pdf-extractor.ts'
import type { RenderedPage } from './reader-render-page.ts'
export type { Box, RenderedPage } from './reader-render-page.ts'

/** One authorized immutable original, one one-based physical page; never accepts a path. */
export async function render(bytes: Uint8Array, ordinal: number, signal?: AbortSignal): Promise<RenderedPage> {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 10_000) throw new RangeError('Invalid PDF page number')
  if (signal?.aborted) throw new DOMException('PDF render cancelled', 'AbortError')
  let doc: Awaited<ReturnType<typeof openReaderPdf>> | undefined
  try {
    doc = await openReaderPdf(bytes, signal)
    return await doc.renderPage(ordinal)
  } catch (err) {
    if (signal?.aborted) throw new DOMException('PDF render cancelled', 'AbortError')
    if (err instanceof RangeError) throw new RangeError('Invalid PDF page number')
    const busy = (err as {code?: string})?.code === 'PDF_BUSY'
    throw Object.assign(new Error(busy ? 'PDF renderer busy' : 'PDF page unavailable'), {code: busy ? 'PDF_BUSY' : 'PDF_RENDER_FAILED'})
  } finally { await doc?.close() }
}
