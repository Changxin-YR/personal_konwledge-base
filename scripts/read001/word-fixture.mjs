import {zip} from '../lib004/acceptance-samples.mjs'

export const before='BeforeBlock', after='AfterBlock'
export const passage='STARTMARK '+('nearfield study ranges across the printed page '.repeat(12))+'ENDMARK'
const ns='http://schemas.openxmlformats.org'
export function wordFixture(paragraphs=[before,passage,after],options={}){
  const p=text=>`<x:p><x:r><x:t xml:space="preserve">${text}</x:t></x:r></x:p>`
  return zip({
    '[Content_Types].xml':`<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels':`<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml':options.xml??`<x:document xmlns:x="${ns}/wordprocessingml/2006/main"><x:body>${paragraphs.map(p).join('')}<x:sectPr><x:pgSz x:w="12240" x:h="15840"/><x:pgMar x:top="1440" x:right="1440" x:bottom="1440" x:left="1440"/></x:sectPr></x:body></x:document>`
  })
}
