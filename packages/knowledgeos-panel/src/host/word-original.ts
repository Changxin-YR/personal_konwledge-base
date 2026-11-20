import {WORD_MEDIA,type WordMedia} from './office-schema.ts'
import {crc32,createInflateRaw,inflateRaw} from 'node:zlib'
import {promisify} from 'node:util'

export class WordInputError extends Error {constructor(){super('INVALID_WORD')}}
const invalid=():never=>{throw new WordInputError()}
export const isWordMedia=(media:unknown):media is WordMedia=>media===WORD_MEDIA.docx||media===WORD_MEDIA.doc

// Bounded format identification, not Office conversion. Do not extract ZIP
// members or hand client-controlled paths to the filesystem.
interface Member {name:string; start:number; packed:number; size:number; method:number; crc:number}
export function checkWordEnvelope(b:Buffer, media:WordMedia):Member[] {
  if(media===WORD_MEDIA.doc){
    if(b.length<512||b.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1'||b.readUInt16LE(28)!==0xfffe||![9,12].includes(b.readUInt16LE(30)))invalid()
    return []
  }
  if(b.length<22||b.readUInt32LE(0)!==0x04034b50)invalid()
  let e=b.length-22
  const floor=Math.max(0,e-65535)
  while(e>=floor&&(b.readUInt32LE(e)!==0x06054b50||e+22+b.readUInt16LE(e+20)!==b.length))e--
  if(e<floor||b.readUInt32LE(e+4)!==0)invalid()
  const entries=b.readUInt16LE(e+10),length=b.readUInt32LE(e+12);let pos=b.readUInt32LE(e+16),expanded=0
  if(!entries||entries>8192||entries!==b.readUInt16LE(e+8)||pos+length!==e)invalid()
  const central=pos,names=new Set<string>(),members:Member[]=[]
  for(let i=0;i<entries;i++){
    if(pos+46>e||b.readUInt32LE(pos)!==0x02014b50)invalid()
    const n=b.readUInt16LE(pos+28),next=pos+46+n+b.readUInt16LE(pos+30)+b.readUInt16LE(pos+32),local=b.readUInt32LE(pos+42)
    if(!n||next>e||local+30>central||b.readUInt32LE(local)!==0x04034b50||b.readUInt16LE(pos+34)!==0)invalid()
    const name=b.subarray(pos+46,pos+46+n),key=name.toString('utf8'),start=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28)
    if(b.readUInt16LE(local+26)!==n||!name.equals(b.subarray(local+30,local+30+n))||names.has(key)||start+b.readUInt32LE(pos+20)>central)invalid()
    if(b.readUInt16LE(pos+8)&1||b.readUInt16LE(local+6)&1||!([0,8].includes(b.readUInt16LE(pos+10)))||b.readUInt16LE(local+8)!==b.readUInt16LE(pos+10))invalid()
    expanded+=b.readUInt32LE(pos+24);if(expanded>256*1024*1024)invalid()
    members.push({name:key,start,packed:b.readUInt32LE(pos+20),size:b.readUInt32LE(pos+24),method:b.readUInt16LE(pos+10),crc:b.readUInt32LE(pos+16)})
    names.add(key);pos=next
  }
  if(pos!==e||!['[Content_Types].xml','_rels/.rels','word/document.xml'].every(k=>names.has(k)))invalid()
  return members
}

const inflate=promisify(inflateRaw)
export async function wordBodyXml(bytes:Buffer){
  const m=checkWordEnvelope(bytes,WORD_MEDIA.docx).find(m=>m.name==='word/document.xml')
  if(!m||m.size<1||m.size>4*1024*1024)return invalid()
  const packed=bytes.subarray(m.start,m.start+m.packed)
  const body=m.method?await inflate(packed,{maxOutputLength:m.size}):packed
  if(body.length!==m.size||crc32(body)!==m.crc)return invalid()
  return new TextDecoder('utf-8',{fatal:true}).decode(body)
}

// Count actual output without accumulating it or writing archive paths. Enforce
// the per-member declared length as well as the bundle-wide decoded budget.
export async function verifyWordBytes(b:Buffer,media:WordMedia):Promise<void>{
  const members=checkWordEnvelope(b,media);let remaining=256*1024*1024
  for(const m of members){
    const packed=b.subarray(m.start,m.start+m.packed)
    if(!m.method){if(m.packed!==m.size||m.size>remaining||crc32(packed)!==m.crc)invalid();remaining-=m.size;continue}
    const decoder=createInflateRaw({chunkSize:32768});let actual=0,crc=0
    try{
      decoder.end(packed)
      for await(const chunk of decoder){actual+=chunk.length;remaining-=chunk.length;if(actual>m.size||remaining<0)invalid();crc=crc32(chunk,crc)}
      if(actual!==m.size||crc!==m.crc||decoder.bytesWritten!==m.packed)invalid()
    }catch{invalid()}finally{decoder.destroy()}
  }
}
