// Disposable Host plugin. No settings writes, credential resolution or RPC endpoint.
import assert from 'node:assert/strict'
import {readFileSync,renameSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ids,checkedRoute,dispatch} from './candidate-live-guards.mjs'
export const name='candidate-live-native',inject=['llm','settings','credentials','agentDefaultModel']
export async function projection(ctx) {
  const pair=ids(ctx.agentDefaultModel.currentSelection())
  const entries=ctx.llm.listConfigurableProviders().filter(p=>p.provider===pair.provider)
  assert.equal(entries.length,1); const dir=entries[0]; assert.equal(dir.settingsNs,'llm-pi-ai')
  const section=ctx.settings.describe({redactSecrets:true}).find(n=>n.ns===dir.settingsNs)
  const profile=section?.value?.providers?.[pair.provider]; assert(profile && !dir.error); assert.match(profile.apiKeyEnv,/^[A-Z][A-Z0-9_]{1,80}$/)
  const credential=await ctx.credentials.describe(profile.apiKeyEnv)
  assert(ctx.llm.listProviders().some(p=>p.id===pair.provider))
  return checkedRoute(pair,await ctx.llm.listModels(pair.provider),dir,profile,credential.configured,ctx.llm.providerRetryPolicy(pair.provider))
}
export function apply(ctx) {
  const root=process.env.KO_RUN; let route,n=0
  const file=name=>join(root,name)
  ctx.on('llm-pi-ai/request-headers',(req,_headers,next)=>{
    try {
      assert(route && process.env.KO_MODE==='live'); assert.deepEqual(ids(ctx.agentDefaultModel.currentSelection()),ids(route)); assert.equal(ctx.llm.providerRetryPolicy(route.provider).maxRetries,0)
      const q=JSON.parse(readFileSync(file('approved.json'),'utf8'))
      dispatch(req,route,q,n+1,i=>renameSync(file('permit-'+i),file('consumed-'+i))); n++
    } catch { throw Error('ACCEPTANCE_DISPATCH_DENIED') }
    return next()
  })
  // The registry may still be attaching configurable providers during boot.
  ctx.effect(()=>{let closed=false; const task=async()=>{
    for(let i=0;i<80&&!closed;i++){ try{const r=await projection(ctx); if(closed)return; route=r
      writeFileSync(file('route.tmp'),JSON.stringify({pid:process.pid,...r}));renameSync(file('route.tmp'),file('route.json'));return
    }catch{await new Promise(r=>setTimeout(r,250))}}
  };void task();return ()=>{closed=true;route=undefined}})
}
