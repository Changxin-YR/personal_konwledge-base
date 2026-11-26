import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
export const sha = b => createHash('sha256').update(b).digest('hex')
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export const tools = ['knowledgeos_read_object','knowledgeos_update_object']
export const title = 'Acceptance synthetic object', bodies = ['Synthetic baseline','Synthetic committed update']
export function ids({provider,model}) {
  assert.match(provider,/^[a-z][a-z0-9-]{0,63}$/); assert.match(model,/^deepseek[-/][a-z0-9][a-z0-9.-]{0,80}(?:\/[a-z0-9-]{1,40})?$/i)
  assert(!/fixture|mock|controlled|replay/i.test(provider+'/'+model)); return {provider,model}
}
export function endpoint(value) {
  const u=new URL(value); assert(u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash && !u.port)
  assert(['api.deepseek.com','tokease.cn'].includes(u.hostname) && /^\/(v1\/?)?$/.test(u.pathname)); return u.origin+u.pathname.replace(/\/$/,'')
}
export function checkedRoute(selected,models,directory,profile,credential,policy) {
  const pair=ids(selected); assert.equal(models.filter(x=>x.id===pair.model).length,1)
  assert.equal(directory.settingsNs,'llm-pi-ai'); assert.deepEqual(directory.settingsPath,['providers',pair.provider])
  assert.equal(credential,true); assert(!profile.apiKey && !Object.keys(profile.headers??{}).length)
  assert.equal(policy.mode,'normal'); assert.equal(policy.maxRetries,0)
  return {...pair,endpoint:endpoint(profile.baseURL??directory.defaultBaseURL)}
}
export function priceApproval(q,r,now=Date.now()) {
  assert.deepEqual(ids(q),ids(r)); assert.equal(endpoint(q.endpoint),r.endpoint); assert.equal(q.currency,'USD_PER_MILLION_TOKENS')
  const age=now-Date.parse(q.reviewed_at); assert(age>=0 && age<=3600000)
  for(const v of [q.input,q.output]) assert(Number.isFinite(v)&&v>0&&v<=1000)
}
export function relayPrice(model,pricing,status,caps) {
  const [name,slug,...extra]=model.split('/'); assert(name && slug!=='' && extra.length===0)
  const rows=pricing.data.filter(m=>m.model_name===name)
  const eligible=rows.filter(m=>m.enable_groups.includes('default'))
  const channels=eligible.flatMap(m=>m.channel_list).filter(c=>!slug||c.route_slug===slug)
  if(slug) {
    assert.equal(channels.length,1)
  } else {
    assert(eligible.length>0 && eligible.length===rows.length)
    assert(eligible.every(m=>m.quota_type===0 && m.enable_groups.length===1 && Array.isArray(m.channel_list) && m.channel_list.length>0))
    const slugs=channels.map(c=>c.route_slug)
    assert(slugs.every(v=>typeof v==='string' && /^[a-z0-9-]{1,40}$/.test(v)))
    assert.equal(new Set(slugs).size,channels.length)
  }
  const group=pricing.group_ratio.default,unit=status.data.quota_per_unit
  assert(Number.isFinite(group)&&group>0&&Number.isFinite(unit)&&unit>0)
  for(const c of channels) for(const t of [c,...(c.time_pricing?[c.time_pricing.regular_pricing,...c.time_pricing.schedules.map(s=>s.pricing)]:[])]) {
    const input=1e6*t.model_ratio*group/unit,output=input*t.completion_ratio
    assert(t.quota_type===0 && input>0 && input<=caps.input && output>0 && output<=caps.output)
  }
}
export function dispatch(req,route,quote,n,consume) {
  assert(n===1||n===2); assert(!req.sessionId&&!req.purpose); assert.deepEqual(ids(req),ids(route)); assert.equal(endpoint(req.baseURL),route.endpoint)
  priceApproval(quote,route); consume(n)
}
export function selection(p,route,i,id) {
  assert.deepEqual(ids(p),ids(route)); assert.equal(p.tool,tools[i]); assert.deepEqual(p.arguments,i===0?{object_id:id}:{object_id:id,expected_revision:1,body:bodies[1]})
}
export function operation(i,id,result,http,sql,ui,receipts) {
  const revision=i+1; assert.match(id,uuid); assert.equal(result.code,i===0?'READ':'UPDATED')
  for(const o of [result.object,http,sql,ui.detail]) assert.deepEqual([o.id,o.revision,o.body,o.title],[id,revision,bodies[i],title])
  assert.deepEqual([ui.selected,ui.label,ui.attr,ui.input,ui.target,receipts],[id,title+' · revision '+revision,String(revision),String(revision),id,i])
  return {tool:tools[i],object_id:id,revision,receipts,ui_reread_and_sql_agree:true,http_reread_agrees:true}
}
