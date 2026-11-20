import {createHash} from 'node:crypto'
import {AssetError} from './asset-store.ts'

// All offsets are UTF-16 code units, matching DOM Range and stored text blocks.
// The caller must supply the fixed, authorized source version, never a client quote.
export function citationAnchor(text:string,start:number,end:number){
  const split=(n:number)=>n>0&&n<text.length&&text.charCodeAt(n-1)>=0xd800&&text.charCodeAt(n-1)<=0xdbff&&text.charCodeAt(n)>=0xdc00&&text.charCodeAt(n)<=0xdfff
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length||split(start)||split(end))throw new AssetError(422,'INVALID_CITATION_RANGE')
  const quote=text.slice(start,end),hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex')
  return {start,end,quote_hash:hash(quote),source_hash:hash(text)}
}

export function resolveCitationText(text:string,anchor:ReturnType<typeof citationAnchor>){
  const digest=createHash('sha256').update(text,'utf8').digest('hex')
  if(digest!==anchor.source_hash)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
  const actual=citationAnchor(text,anchor.start,anchor.end)
  if(actual.quote_hash!==anchor.quote_hash)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
  return text.slice(anchor.start,anchor.end)
}
