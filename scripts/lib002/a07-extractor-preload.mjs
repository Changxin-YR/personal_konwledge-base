// Loaded only by the isolated acceptance Host. Never changes the bundle or SQLite.
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import threads from 'node:worker_threads'

const dir = realpathSync(process.env.KO_RUN)
const holdFile = join(dir,'hold-page')
const holdPage = existsSync(holdFile) ? Number(readFileSync(holdFile,'utf8')) : existsSync(join(dir,'hold3')) ? 3 : 0
const extractor = realpathSync(join(dirname(process.env.KO_ENTRY), 'pdf-extractor.js'))
const record = (event, page) => appendFileSync(join(dir,'boundary.jsonl'), JSON.stringify({pid:process.pid, at:Date.now(), event, page})+'\n')
const NativeWorker = threads.Worker
threads.Worker = class extends NativeWorker {
  constructor(url, options) {
    super(url, options)
    if (options?.workerData !== 'knowledgeos:pdf-extractor:v1') return
    assert.equal(realpathSync(fileURLToPath(url)), extractor)
    let requested, held
    const post = this.postMessage, emit = this.emit
    this.postMessage = function(input,...rest) {
      requested = typeof input === 'number' ? input : undefined
      if (requested) record('request', requested)
      return post.call(this,input,...rest)
    }
    this.emit = function(event,...args) {
      const page = requested, msg = args[0]
      if (event === 'exit') { if (held) clearInterval(held); record('worker-exit',null) }
      if (event !== 'message' || !page) return emit.call(this,event,...args)
      requested = undefined
      // Never mask a real extraction error. Only a successful real reply may be faulted.
      if (typeof msg?.value?.text !== 'string') return emit.call(this,event,...args)
      if (page === 4 && existsSync(join(dir,'fail4'))) {
        record('inject-error',page)
        return emit.call(this,event,{error:'Synthetic single-page extraction failure',fatal:false})
      }
      if (page === holdPage) {
        record('held',page)
        held = setInterval(()=>{
          if (!existsSync(join(dir,'release3'))) return
          clearInterval(held); held = undefined; record('released',page); emit.call(this,event,...args)
        },10)
        return true
      }
      return emit.call(this,event,...args)
    }
  }
}
syncBuiltinESMExports()
