import {AssetError,type BlobRef} from './asset-store.ts'
import type {OfficeStore} from './office-store.ts'
import type {PdfOriginals} from './pdf-originals.ts'

type Store=Pick<OfficeStore,'claim'|'source'|'renew'|'complete'|'fail'>
type Originals=Pick<PdfOriginals,'read'|'put'|'retain'|'discard'>
type Doc={numPages:number;page(n:number):Promise<unknown>;close():Promise<void>}
type Source=NonNullable<ReturnType<Store['source']>>
interface OfficeKit {
  convert(request:{extension:'doc'|'docx';priority:'background';source:{key:string;version:string;bytes:number;
    read(signal:AbortSignal,maxBytes:number):Promise<{bytes:Uint8Array;version:string}>}},signal:AbortSignal):Promise<{pdf:Uint8Array;missingFonts:string[]}>
}
const maxPdf=64*1024*1024
const knownCodes=new Set(['input-too-large','output-too-large','invalid-document','unsupported-format','invalid-output','timeout','unavailable','failed','busy','source-changed','invalid-request'])
const same=(a:Source,b:Source)=>a.assetId===b.assetId&&a.versionId===b.versionId&&a.key===b.key&&a.sha256===b.sha256&&a.byteLength===b.byteLength&&a.extension===b.extension

export function startOfficeWorker(store:Store,originals:Originals,kit:OfficeKit,openPdf:(bytes:Uint8Array)=>Promise<Doc>,log:(msg:string)=>void){
  let stopped=false,pending:Promise<void>|undefined,active:AbortController|undefined
  async function tick(){
    const job=store.claim();if(!job)return
    const {token}=job,controller=new AbortController();active=controller
    const source=()=>{controller.signal.throwIfAborted();const s=store.source(token);if(!s){controller.abort();controller.signal.throwIfAborted();throw Error('source unavailable')}return s}
    const heartbeat=setInterval(()=>{try{if(!store.renew(token))controller.abort()}catch{controller.abort()}},2000)
    heartbeat.unref()
    let stage:BlobRef|undefined,doc:Doc|undefined,phase='SOURCE_UNAVAILABLE'
    try{
      const initial=source(),checked=()=>{const s=source();if(!same(initial,s))throw Error('source changed');return s}
      phase='CONVERSION_FAILED'
      const result=await kit.convert({extension:initial.extension,priority:'background',source:{key:`knowledgeos:${initial.assetId}:${initial.versionId}`,
        version:initial.sha256,bytes:initial.byteLength,read:async(signal,maxBytes)=>{
          signal.throwIfAborted();const s=checked();if(!Number.isSafeInteger(maxBytes)||maxBytes<s.byteLength)throw Error('source exceeds reservation')
          const bytes=await originals.read(s.key,s.sha256,s.byteLength);signal.throwIfAborted();const after=checked();return {bytes,version:after.sha256}
        }}},controller.signal)
      checked();phase='INVALID_OFFICE_RESULT'
      if(!(result.pdf instanceof Uint8Array)||!result.pdf.byteLength||result.pdf.byteLength>maxPdf||!Array.isArray(result.missingFonts)||result.missingFonts.length>1024||result.missingFonts.some(f=>typeof f!=='string'||f.length>512))throw Error('invalid result')
      doc=await openPdf(result.pdf);const pages=doc.numPages;if(!Number.isSafeInteger(pages)||pages<1||pages>10000)throw Error('invalid page count')
      for(let n=1;n<=pages;n++){controller.signal.throwIfAborted();await doc.page(n)}
      await doc.close();doc=undefined;checked();phase='RESULT_STORAGE_UNAVAILABLE'
      stage=await originals.put(result.pdf);checked()
      let committed:boolean
      try{committed=store.complete(token,stage,pages,result.missingFonts)}catch(e){
        // A non-domain error can mean COMMIT/rollback was ambiguous. Never unlink a possibly committed result.
        if(!(e instanceof AssetError)){originals.retain(stage.key);stage=undefined}throw e
      }
      if(committed){originals.retain(stage.key);stage=undefined}
    }catch(e){
      if(!stopped&&!controller.signal.aborted){const code=(e as {code?:unknown})?.code;store.fail(token,typeof code==='string'&&knownCodes.has(code)?code:phase)}
    }finally{
      clearInterval(heartbeat);active=undefined
      try{if(stage)await originals.discard(stage.key)}finally{await doc?.close()}
    }
  }
  const timer=setInterval(()=>{if(!stopped&&!pending)pending=tick().catch(()=>log('knowledgeos-office: worker temporarily unavailable')).finally(()=>{pending=undefined})},300)
  timer.unref();return async()=>{stopped=true;clearInterval(timer);active?.abort();await pending}
}
