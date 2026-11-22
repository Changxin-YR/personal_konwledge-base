import {randomUUID} from 'node:crypto'
import type {ParseTx} from './parse-store.ts'
import type {PdfOriginals} from './pdf-originals.ts'

export const WORD_SEARCH_SCHEMA=`CREATE TABLE word_search_runs (
  conversion_id TEXT PRIMARY KEY REFERENCES office_conversions(id), result_blob_id TEXT NOT NULL REFERENCES blobs(id),
  state TEXT NOT NULL CHECK(state IN ('running','complete','failed')), next_page INTEGER NOT NULL CHECK(next_page>=1),
  attempts INTEGER NOT NULL CHECK(attempts>=0), token TEXT UNIQUE, lease_until TEXT,
  CHECK((state='running' AND token IS NOT NULL AND lease_until IS NOT NULL) OR
    (state!='running' AND token IS NULL AND lease_until IS NULL))
) STRICT;
CREATE TABLE word_search_pages (
  conversion_id TEXT NOT NULL REFERENCES word_search_runs(conversion_id), page INTEGER NOT NULL CHECK(page>=1),
  text TEXT NOT NULL CHECK(length(text)<=32000), PRIMARY KEY(conversion_id,page)
) STRICT;`

const deadline=(now:string,ms=20_000)=>new Date(Date.parse(now)+ms).toISOString()
const sources=`FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
  JOIN knowledge_objects o ON o.id=v.asset_id JOIN blobs b ON b.id=c.result_blob_id`
const eligible=`c.state='ready' AND o.status='active' AND b.media_type='application/pdf'`
const due=`SELECT c.id,c.result_blob_id,c.page_count,b.storage_key,b.byte_length,b.sha256,r.next_page,r.attempts
  ${sources} LEFT JOIN word_search_runs r ON r.conversion_id=c.id WHERE ${eligible}
  AND (r.conversion_id IS NULL OR (r.result_blob_id=c.result_blob_id AND r.state='running' AND r.lease_until<=?))
  ORDER BY c.rowid LIMIT 1`

export class WordSearchIndex {
  constructor(private tx:ParseTx){}
  claim(){
    if(!this.tx('read',(db,now)=>db.prepare(due).get(now)))return
    return this.tx('write',(db,now)=>{
      const r=db.prepare(due).get(now);if(!r)return
      const attempts=Number(r.attempts??0)
      if(attempts>=3){db.prepare("UPDATE word_search_runs SET state='failed',token=NULL,lease_until=NULL WHERE conversion_id=?").run(r.id!);return}
      const token=randomUUID()
      db.prepare(`INSERT INTO word_search_runs VALUES(?,?,'running',1,1,?,?) ON CONFLICT(conversion_id) DO UPDATE SET
        attempts=attempts+1,token=excluded.token,lease_until=excluded.lease_until`).run(r.id!,r.result_blob_id!,token,deadline(now))
      return {token,key:String(r.storage_key),sha256:String(r.sha256),byteLength:Number(r.byte_length),
        total:Number(r.page_count),next:Number(r.next_page??1)}
    })
  }
  publish(token:string,page:number,text:string|null,quality?:'text'|'blank'){return this.tx('write',(db,now)=>{
    const r=db.prepare(`SELECT c.id,c.page_count,c.result_blob_id ${sources} JOIN word_search_runs r ON r.conversion_id=c.id
      WHERE ${eligible} AND r.state='running' AND r.result_blob_id=c.result_blob_id AND r.token=? AND r.lease_until>? AND r.next_page=?`)
      .get(token,now,page)
    if(!r||!Number.isSafeInteger(page)||page<1||page>Number(r.page_count)||text!==null&&text.length>32000)return false
    if(text)db.prepare('INSERT INTO word_search_pages VALUES(?,?,?)').run(r.id!,page,text)
    if(quality==='text'&&text||quality==='blank'&&text===''){
      db.prepare('INSERT INTO recall_word_sources VALUES(?,?,?,?)').run(r.id!,page,r.result_blob_id!,Number(quality==='blank'))
    }
    if(page===Number(r.page_count))db.prepare("UPDATE word_search_runs SET state='complete',next_page=?,attempts=0,token=NULL,lease_until=NULL WHERE token=?").run(page+1,token)
    else db.prepare('UPDATE word_search_runs SET next_page=?,attempts=0,lease_until=? WHERE token=?').run(page+1,deadline(now),token)
    return true
  })}
  defer(token:string,refund=false){this.tx('write',(db,now)=>{
    db.prepare(`UPDATE word_search_runs SET lease_until=?,attempts=max(0,attempts-?) WHERE token=?`).run(deadline(now,1000),refund?1:0,token)
  })}
}

interface Extracted {numPages:number;page(n:number):Promise<{text:string;needsReview:boolean;confirmedBlank:boolean}>;close():Promise<void>}
const errorCode=(e:unknown)=>(e as {code?:string})?.code

export function startWordSearchIndex(store:WordSearchIndex,originals:Pick<PdfOriginals,'read'>,
  open:(bytes:Uint8Array,signal:AbortSignal)=>Promise<Extracted>,log:(msg:string)=>void){
  const lifecycle=new AbortController()
  let pending:Promise<void>|undefined
  async function tick(){
    const job=store.claim();if(!job)return
    const signal=lifecycle.signal
    let doc:Extracted|undefined
    try{
      const bytes=await originals.read(job.key,job.sha256,job.byteLength);signal.throwIfAborted()
      doc=await open(bytes,signal);if(doc.numPages!==job.total)throw Error('Conversion page count changed')
      for(let i=job.next;i<=doc.numPages;i++){
        signal.throwIfAborted();let text:string|null,quality:'text'|'blank'|undefined
        try{const page=await doc.page(i);text=page.text;quality=page.confirmedBlank?'blank':page.needsReview?undefined:'text'}
        catch(e){if(errorCode(e)!=='PDF_PAGE_FAILED')throw e;text=null}
        if(signal.aborted||!store.publish(job.token,i,text,quality))return
      }
    }catch(e){if(!signal.aborted)store.defer(job.token,errorCode(e)==='PDF_BUSY')}
    finally{await doc?.close()}
  }
  const timer=setInterval(()=>{if(!pending)pending=tick().catch(()=>log('knowledgeos-word-search: worker temporarily unavailable')).finally(()=>{pending=undefined})},700)
  timer.unref();return async()=>{clearInterval(timer);lifecycle.abort();await pending}
}
