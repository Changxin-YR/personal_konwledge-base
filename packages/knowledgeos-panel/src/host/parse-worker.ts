import type { ParseStore, PageResult } from './parse-store.ts'
import type { PdfOriginals } from './pdf-originals.ts'

interface DocumentHandle {numPages:number; page(n:number):Promise<PageResult>; close():Promise<void>}
type OpenDocument = (bytes:Uint8Array)=>Promise<DocumentHandle>

// Each worker processes one immutable version at a time. A separate process can
// recover an expired lease; the token is fenced again in each page transaction.
export function startParseWorker(store:ParseStore, originals:Pick<PdfOriginals,'read'>, open:OpenDocument, log:(msg:string)=>void) {
  let stopped=false, pending:Promise<void>|undefined
  async function tick() {
    const job=store.claim(); if(!job)return
    let doc:DocumentHandle|undefined, active=true
    const heart=setInterval(()=>{try{if(!store.renew(job.token))active=false}catch{active=false}},4_000)
    try {
      const bytes=await originals.read(job.key,job.sha256,job.byteLength)
      if(stopped||!active||!store.renew(job.token))return
      doc=await open(bytes)
      if(stopped||!active||!store.initialize(job.token,doc.numPages))return
      let consecutiveFailures=0
      while(!stopped && active){
        const page=store.next(job.token); if(page==null)break
        // A fatal engine error may have terminated its isolated worker. Reopen
        // before extracting another page; never label untouched pages failed.
        if(!doc){
          if(consecutiveFailures>=3){store.fail(job.token);break}
          doc=await open(bytes)
          if(!store.initialize(job.token,doc.numPages))break
        }
        let result:PageResult|null
        try {result=await doc.page(page);consecutiveFailures=0} catch {
          result=null;consecutiveFailures++;await doc.close();doc=undefined
        }
        if(stopped||!active||!store.publish(job.token,page,result))break
        await new Promise<void>(resolve=>setImmediate(resolve))
      }
    } catch {if(!stopped && active)store.fail(job.token)}
    finally {clearInterval(heart);await doc?.close()}
  }
  const timer=setInterval(()=>{
    if(!stopped&&!pending)pending=tick().catch(()=>log('knowledgeos-parse: worker temporarily unavailable')).finally(()=>{pending=undefined})
  },500)
  timer.unref()
  return async()=>{stopped=true;clearInterval(timer);await pending}
}
