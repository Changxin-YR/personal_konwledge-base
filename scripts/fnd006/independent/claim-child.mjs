import { open } from './common.mjs'
const [dir,worker]=process.argv.slice(2), store=open(dir)
process.once('message', async ({at}) => {
  const gate=new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(gate,0,0,Math.max(0,at-Date.now()))
  const started=Date.now()
  try { const claim=store.jobs.claim(worker); process.send({worker,pid:process.pid,started,ended:Date.now(),claim:claim??null}) }
  finally {store.close();process.disconnect()}
})
process.send({ready:true,pid:process.pid})
