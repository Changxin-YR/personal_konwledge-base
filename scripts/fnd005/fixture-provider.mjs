/** Controlled provider fixture. Never a GPT/provider acceptance substitute. */
import { LlmAdapter, LlmError } from '../../.cache/build/dsh-39163dd/packages/llm/llm/src/index.ts'
import { writeFileSync, existsSync } from 'node:fs'
export const name = 'fnd005-controlled-provider'
export const inject = ['llm','tools']
class FixtureAdapter extends LlmAdapter {
  constructor() { super('FND005 controlled fixture') }
  async listModels(provider) { return [{ provider, id: 'deepseek-controlled-tool-model', name: 'Controlled fixture (NOT GPT)' }] }
  async *stream(options) {
    const input = JSON.parse(options.messages[0].content[0].text), instruction = input.instruction
    if (instruction.includes('fixture:missing')) throw new LlmError('missing API key credential', 'MISSING_CREDENTIAL')
    if (instruction.includes('fixture:invalid')) throw new LlmError('invalid credential', 'AUTH', { status: 401 })
    if (instruction.includes('fixture:quota')) throw new LlmError('insufficient_quota', 'RATE_LIMIT', { status: 429 })
    if (instruction.includes('fixture:permission')) throw new LlmError('permission denied', 'AUTH', { status: 403 })
    if (instruction.includes('fixture:failure')) throw new Error('fixture transport failed; secret-is-not-logged')
    if (instruction.includes('fixture:timeout') || instruction.includes('fixture:cancel')) {
      await new Promise((resolve, reject) => { if (options.signal.aborted) reject(options.signal.reason); else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }) })
    }
    const update = instruction.startsWith('修改正文为：')
    const call = { type: 'tool-call', id: 'fixture-call', name: update ? 'knowledgeos_update_object' : 'knowledgeos_read_object', arguments: JSON.stringify({ object_id: input.target_object_id, ...(update ? { expected_revision: input.expected_revision, body: instruction.slice('修改正文为：'.length) } : {}), ...(instruction.includes('fixture:forge') ? { user_id: 'forged', role: 'owner' } : {}) }) }
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: call }
    if (instruction.includes('fixture:multiple')) yield { type: 'block-end', index: 1, block: { ...call, id: 'second' } }
    yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}
export function apply(ctx,config={}) {
  ctx.llm.registerAdapter(['fnd005-fixture'], new FixtureAdapter())
  // Test-only native policy barriers. File paths are trusted isolated harness config.
  if(config.barrierDir){
    const wait=async phase=>{
      if(!existsSync(config.barrierDir+'/'+phase+'.arm'))return
      writeFileSync(config.barrierDir+'/'+phase+'.reached','synthetic barrier')
      const deadline=Date.now()+5000
      while(!existsSync(config.barrierDir+'/'+phase+'.release')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10))
    }
    ctx.on('tools/pre-execute',async(exec,next)=>{if(exec.name.startsWith('knowledgeos_')){await wait('pre');if(existsSync(config.barrierDir+'/native-cancel.arm'))return {kind:'cancel'}}return next()})
    ctx.on('tools/post-execute',async(exec,result,next)=>{if(exec.name.startsWith('knowledgeos_'))await wait('post');return next()})
  }
  if(config.probePath)ctx.effect(()=>{
    let started=false
    const timer=setInterval(async()=>{
      if(started||!ctx.tools.schemas().some(t=>t.name==='knowledgeos_read_object'))return
      started=true;clearInterval(timer)
      try{
        const batch=await ctx.tools.execute({calls:[{type:'tool-call',id:'unbound-probe',name:'knowledgeos_read_object',arguments:JSON.stringify({object_id:'synthetic-unbound-target'})}],signal:new AbortController().signal,maxParallelToolCalls:1})
        const result=batch.results[0].result
        const body=result.isError?{code:result.error?.info?.code}:result.value
        writeFileSync(config.probePath,JSON.stringify({category:'ACTUAL_DSH_NATIVE_EXECUTOR_WITHOUT_BUSINESS_CONTEXT',status:body?.code==='TOOL_CONTEXT_REQUIRED'?'PASS':'FAIL',code:body?.code??null})+'\n')
      }catch{writeFileSync(config.probePath,JSON.stringify({status:'FAIL',code:'NATIVE_PROBE_FAILED'})+'\n')}
    },50)
    return()=>clearInterval(timer)
  })
}
