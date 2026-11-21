// Adapter probe only; no Host login, real credentials, HTTP dispatch, or inference.
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtempSync,readFileSync,realpathSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const pin='39163dd30f703a79079e2d2446545cff3c453738', root=new URL('../../',import.meta.url)
const provider='deepseek-official',model='deepseek-flash'
const adapter='packages/llm/llm-deepseek-api-key/lib/index.js'
const transport='packages/llm/llm-deepseek/lib/index.js'
const extensions='packages/llm/deepseek-llm-api-extensions/lib/index.js'
const registry='packages/llm/llm/lib/index.js'
const hash=b=>createHash('sha256').update(b).digest('hex')
const expected={
  [adapter]:'072d554c542a1251ca847d5272decb5ead28759dcd940b48b53f76ffa46b2b77',
  [transport]:'9668b6fa470995bcfe65bbcd01506a4601b562bdfb248f732a1c9f7fa173d002',
  [extensions]:'75682373a56794240b8e7dd08fa363c528a86a0d626007cb849c3b74f7754b6a',
  [registry]:'b614abe654ef0ae3e74e990319410a6f28c474f03b054e33460e6664fe20a587',
}

async function probe(runtime){
  assert(!Object.hasOwn(process.env,'DEEPSEEK_API_KEY'))
  const modules=Object.fromEntries(Object.keys(expected).map(path=>[path,hash(readFileSync(join(runtime,path)))]))
  assert.deepEqual(modules,expected)
  const imported=path=>import(pathToFileURL(join(runtime,path)).href)
  const options={provider,model,system:'Offline transport probe',messages:[{role:'user',content:[{type:'text',text:'fixture'}]}],signal:AbortSignal.timeout(10_000)}
  const calls=[];globalThis.fetch=async (input,init)=>{
    const url=new URL(input instanceof Request?input.url:input), method=init?.method??'GET'
    calls.push({path:url.pathname,method})
    if(url.origin==='https://api.deepseek.com'&&url.pathname==='/models'&&method==='GET')return Response.json({object:'list',data:[]})
    throw Error('Offline preflight deliberately denied transport')
  }
  // Never relay provider diagnostics or prints from the loaded runtime.
  console.warn=()=>{};console.error=()=>{}
  const require=createRequire(join(runtime,adapter)),{Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const Runtime=(await imported(registry)).default, ApiKey=await imported(adapter), Extensions=(await imported(extensions)).default
  const run=async(config,work)=>{
    const ctx=new Context();try{await ctx.plugin(Runtime);await ctx.plugin(Extensions);await ctx.plugin(ApiKey,config);await work(ctx)}finally{await ctx.fiber.dispose()}
  }
  const stream=async ctx=>{let finish;for await(const chunk of ctx.llm.stream({...options,signal:AbortSignal.timeout(10_000)}))if(chunk.type==='finish')finish=chunk.reason;return finish}
  const checks={}
  await run({},async ctx=>{
    assert.deepEqual(await ctx.llm.listModels(provider),[])
    const failure=await stream(ctx);assert.equal(failure?.kind,'error');assert.deepEqual(calls,[])
    checks.without_credential={model_count:0,directory_attempts:0,messages_attempts:0,files_attempts:0}
  })
  process.env.KO_FND005_PROBE_KEY='synthetic-offline-preflight'
  try{
    await run({apiKeyEnv:'KO_FND005_PROBE_KEY'},async ctx=>{
      await ctx.llm.prepareCall({provider,model},AbortSignal.timeout(10_000))
      assert.deepEqual(calls,[{path:'/models',method:'GET'}]);checks.stock_prepare_before_messages={observed:calls.splice(0)}
    })
    await run({apiKeyEnv:'KO_FND005_PROBE_KEY',models:[{id:model}]},async ctx=>{
      let prepared=0
      ctx.deepseekLlmApiExtensions.register('offline_probe_contribution',{prepare(){prepared++;throw Error('Synthetic missing permit')}})
      const failure=await stream(ctx);assert.equal(failure?.kind,'error');assert.equal(prepared,1)
      assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.match(calls[0].path,/\/messages$/)
      checks.extension_throw_is_not_a_gate={fixture_contributor_called:prepared,observed:calls.splice(0),files_attempts:0}
    })
  }finally{delete process.env.KO_FND005_PROBE_KEY}
  console.log(JSON.stringify({status:'PASS',scope:'offline_pinned_native_adapter_only',upstream:pin,modules,checks,network_dispatches:0,real_inference_requests:0,live_acceptance:'BLOCKED'},null,2))
}

if(process.argv[2]==='--isolated-probe'){
  try{await probe(realpathSync(process.argv[3]))}catch(e){process.stdout.write(JSON.stringify({status:'FAIL',assertion_line:String(e.stack).match(/native-egress-preflight\.mjs:\d+/)?.[0]})+'\n');process.exitCode=1}
}else{
  const cache=resolve(process.argv[2]??fileURLToPath(new URL('.cache/',root))),runtime=realpathSync(join(cache,'build','dsh-39163dd'))
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:join(cache,'upstream','deepseek-harness'),encoding:'utf8'}).trim(),pin)
  const home=mkdtempSync(join(tmpdir(),'ko-native-offline-')),env={}
  for(const [k,v] of Object.entries(process.env))if(/^(systemroot|windir|comspec|path|pathext|processor_.*|number_of_processors)$/i.test(k))env[k]=v
  for(const k of ['DSH_HOME','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])env[k]=home
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--isolated-probe',runtime],{env,encoding:'utf8',windowsHide:true,timeout:30_000})
  if(result.stdout)process.stdout.write(result.stdout)
  process.exitCode=result.status??1
}
