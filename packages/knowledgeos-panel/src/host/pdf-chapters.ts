export const maxPdfPages=10_000
export const maxPdfChapters=100
export type PdfChapter=readonly [first:number,last:number]

/** Validate inclusive, 1-based physical page ranges without expanding the document. */
export function pdfChapters(value:unknown,total=maxPdfPages):PdfChapter[]{
  if(!Number.isSafeInteger(total)||total<1||total>maxPdfPages||!Array.isArray(value)||value.length<1||value.length>maxPdfChapters)
    throw Error('INVALID_PDF_CHAPTERS')
  const ranges:PdfChapter[]=[]
  let previous=0
  for(const pair of value){
    if(!Array.isArray(pair)||pair.length!==2)throw Error('INVALID_PDF_CHAPTERS')
    const [first,last]=pair
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<=previous||last<first||last>total)
      throw Error('INVALID_PDF_CHAPTERS')
    ranges.push([first,last]);previous=last
  }
  return ranges
}

export function pdfChapterLocation(ranges:readonly PdfChapter[],chapter:number,page:number){
  const range=ranges[chapter-1]
  if(!Number.isSafeInteger(chapter)||!range||!Number.isSafeInteger(page)||page<1||page>range[1]-range[0]+1)
    throw Error('INVALID_PDF_CHAPTER_PAGE')
  return range[0]+page-1
}
