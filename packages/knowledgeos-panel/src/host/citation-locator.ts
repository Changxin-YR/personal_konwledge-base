import {createHash} from 'node:crypto'
import {AssetError} from './asset-store.ts'
import type {ReaderSource} from './citation-store.ts'

const hash=(x:string)=>createHash('sha256').update(x,'utf8').digest('hex')
export interface LocatorBox {start:number;end:number;x:number;y:number;width:number;height:number}
export interface RenderWitness {conversion_id?:string;sha256:string;ordinal:number;text:string;width:number;height:number;boxes:LocatorBox[]}
export function makeLocator(s:ReaderSource,text:string,start:number,end:number,neighbors:{previous:string|null;next:string|null},w?:RenderWitness){
  // Source-local block identity, stable even when a passage occurs twice. Word uses the
  // fixed conversion's physical page and the enclosing normalized line boundaries.
  const lineStart=text.lastIndexOf('\n',Math.max(0,start-1)),lineEnd=text.indexOf('\n',end)
  const lo=s.kind==='office'&&start!==0?lineStart+1:0,hi=s.kind==='office'&&lineEnd!==-1?lineEnd:text.length
  const blockId=hash(JSON.stringify([s.version_id,s.conversion_id??null,s.ordinal,lo,hi]))
  const previous=s.kind==='office'&&lo>0?hash(text.slice(lo>1?text.lastIndexOf('\n',lo-2)+1:0,lo-1)):neighbors.previous
  const nextEnd=text.indexOf('\n',hi+1),next=s.kind==='office'&&hi<text.length?hash(text.slice(hi+1,nextEnd<0?text.length:nextEnd)):neighbors.next
  const context={block_id:blockId,block_start:lo,block_end:hi,previous,next,
    before_hash:hash(text.slice(Math.max(0,start-64),start)),after_hash:hash(text.slice(end,end+64))}
  if(s.kind==='text')return {context,geometry:null}
  if(!w||!s.ref||s.ref.sha256!==w.sha256||s.conversion_id!==w.conversion_id||s.ordinal!==w.ordinal||w.text!==text)throw new AssetError(409,'CITATION_SOURCE_CHANGED')
  const boxes=w.boxes.filter(b=>b.start<end&&b.end>start).map(({start,end,x,y,width,height})=>({start,end,x,y,width,height}))
  return {context,geometry:{page:s.ordinal,width:w.width,height:w.height,source_sha256:w.sha256,boxes}}
}
