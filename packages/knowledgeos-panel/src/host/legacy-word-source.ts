import {randomUUID} from 'node:crypto'
import {open,unlink} from 'node:fs/promises'
import type {LegacyWordSource} from './reader-http.ts'
import type {PdfOriginals} from './pdf-originals.ts'
import type {startOfficeWorker} from './office-worker.ts'

type Kit=Parameters<typeof startOfficeWorker>[2]

// Use the same locked Host converter as the PDF rendition. Its temporary
// derivative is not published as an original, exposed in HTTP, or persisted.
export function legacyWordSource(kit:Kit,originals:PdfOriginals):LegacyWordSource {
  return async (source,check,signal)=>{
    if(!kit.convertTo)throw new Error('Office structure conversion unavailable')
    const result=await kit.convertTo({extension:'doc',format:'docx',output:{owner:randomUUID(),name:'structure.docx'},source:{
      key:`knowledgeos-word-structure:${source.sha256}`,version:source.sha256,bytes:source.byteLength,
      async read(active,maxBytes){
        active.throwIfAborted();check()
        if(source.byteLength>maxBytes)throw new Error('Office source exceeds reservation')
        const bytes=await originals.read(source.key,source.sha256,source.byteLength)
        active.throwIfAborted();check();return {bytes,version:source.sha256}
      }
    }},signal)
    try{
      signal.throwIfAborted();check()
      if(!Number.isSafeInteger(result.bytes)||result.bytes<1||result.bytes>32*1024*1024)throw new Error('Office structure exceeds limit')
      const file=await open(result.path,'r')
      try{
        if((await file.stat()).size!==result.bytes)throw new Error('Office structure changed')
        const bytes=Buffer.alloc(result.bytes+1),{bytesRead}=await file.read({buffer:bytes,length:bytes.length,position:0})
        if(bytesRead!==result.bytes)throw new Error('Office structure changed')
        return bytes.subarray(0,bytesRead)
      }finally{await file.close()}
    }finally{await unlink(result.path).catch(()=>{})} // The provider also enforces output retention.
  }
}
