import {createHash} from 'node:crypto'
import {SaxesParser} from 'saxes'
import {wordBodyXml} from './word-original.ts'

const sha=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex')
const wordNs=new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'])
const bodyLimit=1_000_000
export const wordPageLimit=512

export async function wordParagraphs(bytes:Buffer){
  const xml=await wordBodyXml(bytes),p=new SaxesParser({xmlns:true}),stack:string[]=[],paragraphs:string[]=[]
  let ns='',body=0,paragraph=0,runText=0,omitted=0,text='',count=0
  const invalid=():never=>{throw new Error('Unsupported Word structure')}
  const add=(s:string)=>{count+=s.length;if(count>bodyLimit)invalid();text+=s}
  p.on('doctype',invalid)
  p.on('opentag',tag=>{
    stack.push(tag.uri===ns?tag.local:'');const depth=stack.length
    if(depth>128)invalid()
    if(depth===1){if(!wordNs.has(tag.uri)||tag.local!=='document')invalid();ns=tag.uri;return}
    if(depth===2&&tag.uri===ns&&tag.local==='body'){if(body||paragraphs.length)invalid();body=depth;return}
    if(!body||omitted)return
    // These are separate stories or mutually exclusive alternatives. Do not
    // pretend their ordering and inclusion can be derived from the main body.
    if(tag.local==='AlternateContent'||tag.uri===ns&&['altChunk','txbxContent','headerReference','footerReference'].includes(tag.local))invalid()
    if(tag.uri!==ns)return
    if(['del','moveFrom'].includes(tag.local)){omitted=depth;return}
    if(tag.local==='p'){if(paragraph||paragraphs.length>=32768)invalid();paragraph=depth;text='';return}
    if(!paragraph||stack[depth-2]!=='r')return
    if(tag.local==='t')runText=depth
    if(['tab','br','cr','ptab'].includes(tag.local))add(tag.local==='tab'||tag.local==='ptab'?'\t':'\n')
    if(tag.local==='noBreakHyphen')add('\u2011')
    if(tag.local==='softHyphen')add('\u00ad')
  })
  const characters=(s:string)=>{if(runText&&!omitted)add(s)}
  p.on('text',characters);p.on('cdata',characters)
  p.on('closetag',()=>{
    const depth=stack.length
    if(depth===runText)runText=0
    if(depth===omitted)omitted=0
    if(depth===paragraph){paragraphs.push(text);paragraph=0}
    if(depth===body)body=0
    stack.pop()
  })
  p.write(xml).close()
  return paragraphs
}

// Layout may introduce whitespace at any point. Compare the entire visible
// body in order (not a search for the selected quote), and keep UTF-16 indices
// on both sides. Different non-whitespace content fails closed.
const compact=(s:string)=>s.replace(/\s/gu,'')
function offsets(s:string){
  const indices:number[]=[]
  for(const part of s.matchAll(/\S+/gu))for(let i=0;i<part[0].length;i++)indices.push(part.index+i)
  return indices
}
export interface WordBlock {block_id:string;ordinal:number;start:number;end:number;page_start:number;page_end:number;previous:string|null;next:string|null}
export interface WordSelection {source_sha256:string;blocks:WordBlock[]}

export async function alignWordSelection(paragraphs:readonly string[],version:string,sourceSha:string,ordinal:number,text:string,start:number,end:number,
  pageCount:number,page:(n:number)=>Promise<string>):Promise<WordSelection|undefined>{
  if(pageCount>wordPageLimit||ordinal>pageCount)return
  const parts=paragraphs.map(compact),body=parts.join('');if(!body||body.length>bodyLimit)return
  let pageStart=0,cursor=0
  for(let n=1;n<=pageCount;n++){
    const pageText=await page(n),part=compact(pageText)
    if(!body.startsWith(part,cursor)||n===ordinal&&pageText!==text)return
    if(n===ordinal)pageStart=cursor
    cursor+=part.length
  }
  if(cursor!==body.length)return
  const pageOffsets=offsets(text),first=pageOffsets.findIndex(i=>i>=start)
  if(first<0||pageOffsets[first]!>=end)return
  let last=first
  while(last+1<pageOffsets.length&&pageOffsets[last+1]!<end)last++
  const lo=pageStart+first,hi=pageStart+last+1,blocks:WordBlock[]=[]
  cursor=0
  for(const [i,part] of parts.entries()){
    const startAt=cursor;cursor+=part.length
    if(!part||cursor<=lo)continue
    if(startAt>=hi)break
    const source=offsets(paragraphs[i]!),ordinal=i+1
    const previous=paragraphs[i-1],next=paragraphs[i+1]
    blocks.push({block_id:sha(JSON.stringify(['word-paragraph-v1',version,sourceSha,ordinal])),ordinal,
      start:source[Math.max(lo,startAt)-startAt]!,end:source[Math.min(hi,cursor)-startAt-1]!+1,
      page_start:pageOffsets[Math.max(0,startAt-pageStart)]!,page_end:pageOffsets[Math.min(pageOffsets.length,cursor-pageStart)-1]!+1,
      previous:previous===undefined?null:sha(previous),next:next===undefined?null:sha(next)})
    if(blocks.length>1024)return
  }
  if(blocks.length)return {source_sha256:sourceSha,blocks}
}
