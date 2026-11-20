import {createHash} from 'node:crypto'
import {AssetError} from './asset-store.ts'
import type {ReaderSource} from './citation-store.ts'
import type {WordSelection} from './word-locator.ts'

const hash=(x:string)=>createHash('sha256').update(x,'utf8').digest('hex')
export interface LocatorBox {start:number;end:number;x:number;y:number;width:number;height:number}
export interface RenderWitness {conversion_id?:string;sha256:string;ordinal:number;text:string;width:number;height:number;boxes:LocatorBox[];word?:WordSelection}
export function makeLocator(s:ReaderSource,text:string,start:number,end:number,neighbors:{previous:string|null;next:string|null},w?:RenderWitness){
  const word=s.kind==='office'?w?.word:undefined
  if(s.kind==='office'&&(!word?.blocks.length||word.source_sha256!==s.wordOriginal?.sha256))throw new AssetError(422,'WORD_STRUCTURE_UNVERIFIED')
  const first=word?.blocks[0],last=word?.blocks.at(-1)
  const lo=first?Math.min(start,first.page_start):0,hi=last?Math.max(end,last.page_end):text.length
  const blockId=first?.block_id??hash(JSON.stringify([s.version_id,null,s.ordinal,lo,hi]))
  const context={block_id:blockId,block_start:lo,block_end:hi,previous:first?first.previous:neighbors.previous,next:last?last.next:neighbors.next,
    before_hash:hash(text.slice(Math.max(0,start-64),start)),after_hash:hash(text.slice(end,end+64))}
  if(s.kind==='text')return {context,geometry:null}
  if(!w||!s.ref||s.ref.sha256!==w.sha256||s.conversion_id!==w.conversion_id||s.ordinal!==w.ordinal||w.text!==text)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
  const boxes=w.boxes.filter(b=>b.start<end&&b.end>start).map(({start,end,x,y,width,height})=>({start,end,x,y,width,height}))
  return {context,geometry:{page:s.ordinal,width:w.width,height:w.height,source_sha256:w.sha256,boxes},...(word?{word}:{})}
}
