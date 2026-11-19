import assert from 'node:assert/strict'
import {bodies,ids,sha,title,uuid} from './candidate-live-guards.mjs'

export function statusUsage(s,attempts) {
  assert.equal(s.attempts,attempts);const usage={attempts}
  for(const k of ['reported_input_tokens','reported_output_tokens','unknown_cost_calls']) {
    assert(Number.isSafeInteger(s[k])&&s[k]>=0);usage[k]=s[k]
  }
  assert(usage.unknown_cost_calls<=attempts)
  assert(Number.isFinite(s.known_estimated_usd)&&s.known_estimated_usd>=0)
  assert.equal(typeof s.budget_warning,'boolean')
  return {...usage,known_estimated_usd:s.known_estimated_usd,budget_warning:s.budget_warning}
}
export function reread(bytes) {
  const {data}=JSON.parse(bytes);assert.equal(typeof data.body,'string')
  return {data,http_revision:data.revision,http_response_sha256:sha(bytes),http_body_sha256:sha(Buffer.from(data.body,'utf8'))}
}
// Screenshot only existing, validated leaf nodes. Omit the unfiltered object JSON,
// tool/result, input fields, links and every other card, even on a successful run.
const style='body > :not(main), main > *, main > section > * {display:none!important} '+
  'main > p#who, main > section:has(> #status), main > section:has(> #objects), main > section > :is(p#model,p#status,select#objects) {display:block!important} '+
  'main *,main {background-image:none!important} *::before,*::after {content:none!important}'
export async function capture(page,base,route,id,revision) {
  const url=base+'/knowledgeos/ai';assert.equal(page.url(),url);assert.match(id,uuid);ids(route)
  const who='已登录 · Synthetic testmember（testmember）',model='模型：'+route.provider+' / '+route.model,status='重新读取完成 · revision '+revision
  const panel=page.locator('body > main');assert.equal(await panel.count(),1)
  const safe=await panel.evaluate((m)=>{
    const elements=[':scope > p#who',':scope > section > p#model',':scope > section > p#status',':scope > section > select#objects'].map(s=>{const matches=m.querySelectorAll(s);if(matches.length!==1)throw Error('panel');return matches[0]})
    const [who,model,status,list]=elements
    if([who,model,status].some(e=>e.childElementCount)||list.options.length!==1||list.childElementCount!==1||list.options[0].childElementCount||list.options[0].label!==list.options[0].textContent)throw Error('panel')
    if([m,...elements.map(e=>e.parentElement)].some(e=>Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim())))throw Error('panel')
    return [who.textContent,model.textContent,status.textContent,list.value,list.selectedOptions[0].textContent]
  });assert.deepEqual(safe,[who,model,status,id,title+' · revision '+revision]);assert.equal(page.url(),url)
  const png=await panel.screenshot({type:'png',style,animations:'disabled',caret:'hide'});assert.equal(page.url(),url)
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return png
}
export function operationEvidence(op,i) {
  assert.equal(op.http_revision,i+1);assert.match(op.http_response_sha256,/^[a-f0-9]{64}$/);assert.equal(op.http_body_sha256,sha(bodies[i]));assert.match(op.screenshot_sha256,/^[a-f0-9]{64}$/)
  const before=statusUsage(op.usage_before,i),after=statusUsage(op.usage_after,i+1)
  for(const k of ['reported_input_tokens','reported_output_tokens','known_estimated_usd','unknown_cost_calls'])assert(after[k]>=before[k])
  return {http_revision:op.http_revision,http_response_sha256:op.http_response_sha256,http_body_sha256:op.http_body_sha256,usage_before:before,usage_after:after,screenshot:'revision-'+(i+1)+'.png',screenshot_sha256:op.screenshot_sha256}
}
