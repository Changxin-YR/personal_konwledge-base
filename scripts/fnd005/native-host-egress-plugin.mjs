import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {setTimeout as delay} from 'node:timers/promises'

export const name='native-egress-probe',inject=['llm','credentials']
const provider='deepseek-official',model='deepseek-flash',endpoint='https://api.deepseek.com',messagesEndpoint=endpoint+'/anthropic'
const transport='packages/llm/llm-deepseek/lib/index.js'
const transportHash='9668b6fa470995bcfe65bbcd01506a4601b562bdfb248f732a1c9f7fa173d002'

export function apply(ctx){
  const run=process.env.KO_RUN,loader=join(run,'loaded.json'),trace=join(run,'native-blocked.jsonl')
  const counts=()=>existsSync(trace)?readFileSync(trace,'utf8').trim().split('\n').map(line=>JSON.parse(line).route):[]
  ctx.effect(()=>{let live=true;const probe=async()=>{
    let phase='isolated-host-readiness'
    const result={status:'NOT_RUN',pid:process.pid,checks:{}}
    try{
      let route
      for(let i=0;i<120&&live;i++){
        route=ctx.llm.listConfigurableProviders().find(row=>row.provider===provider)
        if(route&&existsSync(loader))break
        await delay(100)
      }
      if(!live)return
      assert(route);assert.equal(route.settingsNs,'llm-deepseek');assert.deepEqual(route.settingsPath,[])
      assert.equal(JSON.parse(readFileSync(loader,'utf8')).hash,process.env.KO_HASH)
      const payload={provider,model,system:'Isolated transport preflight',messages:[{role:'user',content:[{type:'text',text:'Synthetic validation'}]}]}
      phase='native-official-no-credentials'
      assert.equal(Object.hasOwn(process.env,'DEEPSEEK_API_KEY'),false)
      assert.equal((await ctx.credentials.describe('DEEPSEEK_API_KEY')).configured,false)
      assert.deepEqual(await ctx.llm.listModels(provider),[])
      let finish
      for await(const chunk of ctx.llm.stream({...payload,signal:AbortSignal.timeout(4000)}))if(chunk.type==='finish')finish=chunk.reason
      assert.equal(finish?.kind,'error');assert.deepEqual(counts(),[])
      result.checks.unconfigured_official_route={provider,settings_ns:route.settingsNs,configured:false,model_count:0,transport_attempts:0}
      phase='native-transport-denials'
      const source=join(process.cwd(),transport),digest=createHash('sha256').update(readFileSync(source)).digest('hex');assert.equal(digest,transportHash)
      const native=await import(pathToFileURL(source).href),signal=()=>AbortSignal.timeout(4000)
      await assert.rejects(()=>native.requestModelListing(endpoint+'/models',{},signal()))
      const adapter=new native.DeepSeekAdapter({options:()=>native.resolveAdapterOptions({baseURL:messagesEndpoint,models:[{id:model}]}),
        resolveAuth:async()=>({headers:{}}),resolveUserId:()=> 'offline-probe',prepareExtensions:async()=>({fields:{},accept:async()=>{}})})
      await assert.rejects(async()=>{for await(const _ of adapter.stream({...payload,signal:signal()}))assert.fail('Unexpected transport data')},{code:'TRANSPORT'})
      const files=new native.DeepSeekFilesClient({baseURL:messagesEndpoint,headers:{}})
      await assert.rejects(()=>files.upload({data:Uint8Array.of(0),mediaType:'image/png',filename:'synthetic.png',expiresAfterSeconds:3600,signal:signal()}))
      assert.deepEqual(counts(),['directory','messages','files'])
      result.checks.denied_native_transports={directory:1,messages:1,files:1,transport_sha256:digest,synthetic_no_auth:true}
      result.status='PASS';result.network_dispatches=0;result.real_inference_requests=0
    }catch(error){result.status='FAIL';result.failure={phase,line:String(error.stack).match(/native-host-egress-plugin\.mjs:\d+/)?.[0]}}
    if(!live)return
    writeFileSync(join(run,'native-egress.tmp'),JSON.stringify(result)+'\n',{flag:'wx'})
    renameSync(join(run,'native-egress.tmp'),join(run,'native-egress.json'))
  };void probe();return ()=>{live=false}})
}
