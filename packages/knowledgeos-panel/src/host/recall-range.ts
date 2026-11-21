import {createHash} from 'node:crypto'
import {AssetError} from './asset-store.ts'

export type RecallPoint = {ordinal:number; offset:number; source_hash:string}
export type RecallSegment = {ordinal:number; start:number; end:number; source_hash:string}
export type RecallMask = {ordinal:number; start:number; end:number; group:number}
type ReadUnit = (ordinal:number)=>string|undefined
type PracticeRun = {kind:'text'; text:string} | {kind:'hidden'; group:number; length:number}

const digest=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex')
const invalid=()=>new AssetError(422,'INVALID_RECALL_RANGE')
const changed=()=>new AssetError(409,'RECALL_SOURCE_CHANGED')
const available=(text:string|undefined)=>{
  if(text===undefined)throw new AssetError(409,'RECALL_SOURCE_NOT_READY')
  return text
}
function boundary(text:string,n:number){
  if(!Number.isSafeInteger(n)||n<0||n>text.length)return false
  const a=text.charCodeAt(n-1),b=text.charCodeAt(n)
  return !(a>=0xd800&&a<=0xdbff&&b>=0xdc00&&b<=0xdfff)
}

/** Read the selected version through a single, authorized source transaction. */
export function recallSelection(first:RecallPoint,last:RecallPoint,total:number,read:ReadUnit):RecallSegment[]{
  if(![first.ordinal,last.ordinal,total].every(Number.isSafeInteger)||first.ordinal<1||last.ordinal<first.ordinal||last.ordinal>total)throw invalid()
  const segments:RecallSegment[]=[]
  for(let ordinal=first.ordinal;ordinal<=last.ordinal;ordinal++){
    const text=available(read(ordinal)), source_hash=digest(text)
    if(ordinal===first.ordinal&&source_hash!==first.source_hash||ordinal===last.ordinal&&source_hash!==last.source_hash)throw changed()
    const start=ordinal===first.ordinal?first.offset:0,end=ordinal===last.ordinal?last.offset:text.length
    if(!boundary(text,start)||!boundary(text,end)||start>end)throw invalid()
    segments.push({ordinal,start,end,source_hash})
  }
  if(!segments.some(s=>s.end>s.start))throw invalid()
  return segments
}

export function recallMasks(segments:readonly RecallSegment[],masks:readonly RecallMask[],read:ReadUnit):RecallMask[]{
  const byPage=new Map(segments.map(s=>[s.ordinal,s])), normalized=masks.map(m=>({...m})).sort((a,b)=>a.ordinal-b.ordinal||a.start-b.start||a.end-b.end)
  let previous:RecallMask|undefined, text=''
  for(const m of normalized){
    const s=byPage.get(m.ordinal)
    if(!s||!Number.isSafeInteger(m.group)||m.group<1||m.start<s.start||m.end>s.end||m.start>=m.end)throw invalid()
    if(previous?.ordinal!==m.ordinal){text=available(read(m.ordinal));if(digest(text)!==s.source_hash)throw changed()}
    else if(m.start<previous.end)throw invalid()
    if(!boundary(text,m.start)||!boundary(text,m.end))throw invalid()
    previous=m
  }
  return normalized
}

/** No unrevealed answer text is returned by this projection. */
export function recallPractice(segment:RecallSegment,masks:readonly RecallMask[],revealed:ReadonlySet<number>,text:string):PracticeRun[]{
  if(digest(text)!==segment.source_hash)throw changed()
  const runs:PracticeRun[]=[];let offset=segment.start
  const visible=(start:number,end:number)=>{if(end>start)runs.push({kind:'text',text:text.slice(start,end)})}
  for(const m of masks){
    if(m.ordinal!==segment.ordinal)continue
    visible(offset,m.start)
    if(revealed.has(m.group))visible(m.start,m.end)
    else runs.push({kind:'hidden',group:m.group,length:m.end-m.start})
    offset=m.end
  }
  visible(offset,segment.end)
  return runs
}
