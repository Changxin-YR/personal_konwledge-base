// Checkpoint smoke with clock boundaries, not full A34 or independent acceptance.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie,sql} from '../fnd004/harness.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'
import {candidateFacts} from '../integrated-case-proof.mjs'
import {projectPolicy,redemptionRace,transactionFaults} from './host-policy-checks.mjs'

const [candidate,entry,parent='.cache/share001-smoke']=process.argv.slice(2)
const root=fileURLToPath(new URL('../../',import.meta.url)),self='scripts/share001/host-smoke.mjs'
const sha=x=>createHash('sha256').update(x).digest('hex'),runner=sha(readFileSync(join(root,self)))
assert.equal(runner,sha(execFileSync('git',['show',candidate+':'+self],{cwd:root})))
const helper='scripts/share001/host-policy-checks.mjs',policyHash=sha(readFileSync(join(root,helper)))
assert.equal(policyHash,sha(execFileSync('git',['show',candidate+':'+helper],{cwd:root})))
mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(parent,'run-')),prefix='/knowledge/v1',marker={'x-knowledgeos-request':'1'},password=randomUUID()
const t0=Date.now(),day=86_400_000
const {tree,source_tree,entry_sha256,build_sha256}=candidateFacts(root,candidate);assert.equal(entry_sha256,entry)
const facts={candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256:runner,policy_helper_sha256:policyHash,status:'NOT_RUN',scope:'checkpoint_smoke_clock_policy_and_faults',T01:'NOT_RUN',T02:'NOT_RUN',A34:'NOT_RUN',checks:[]}
let h,browser,phase='bind and boot'
async function http(ctx,path,code,method='GET',data,key=randomUUID()){
  const r=await ctx.request.fetch(h.base+prefix+path,{method,headers:{...marker,'idempotency-key':key},data,maxRedirects:0})
  assert.equal(r.status(),code,method+' '+path);if(code===204)return
  const body=await r.json();return code>=400?body.code:body.data
}
async function login(name,viewport){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();await page.goto(h.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  return {ctx,page,user:(await http(ctx,'/me',200)).id}
}
async function upload(a,name,source){
  const response=await a.ctx.request.post(h.base+prefix+'/imports',{
    headers:{...marker,'idempotency-key':randomUUID(),'content-type':'text/plain','x-knowledgeos-filename':name},data:Buffer.from(source)})
  assert.equal(response.status(),201);return (await response.json()).data
}
try{
  h=await isolate(candidate,entry,{businessClock:t0});facts.binding=h.facts
  const boot=await h.start(),cookie=await entryCookie(boot.entry)
  assert.equal((await api(h.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})).status,201)
  for(const name of ['first','rival','outsider'])assert.equal((await api(h.port,'','POST',prefix+'/auth/register',{login_name:name,display_name:name,password})).status,201)
  const {chromium}=await import(pathToFileURL(h.playwright));browser=await chromium.launch({channel:'chrome',args:['--disable-background-networking']});facts.chrome=browser.version()
  const owner=await login('owner',{width:1280,height:900}),first=await login('first',{width:430,height:840}),rival=await login('rival'),outsider=await login('outsider')
  const src='Invitation smoke synthetic original',doc=await upload(owner,'invite-source.txt',src),resource='/objects/'+doc.id,original='/assets/'+doc.id+'/versions/'+doc.version_id+'/reader?unit=1'
  await http(first.ctx,original,404);await http(rival.ctx,original,404)
  phase='Chrome issue and redeem'
  await owner.page.goto(h.base+'/knowledgeos/library');await owner.page.getByRole('link',{name:'邀请码'}).click();await owner.page.locator('#workspace').waitFor()
  await owner.page.locator('#assets').selectOption(doc.id);await owner.page.locator('#permission').selectOption('edit');await owner.page.locator('#uses').fill('3')
  await owner.page.getByRole('button',{name:'预览',exact:true}).click();await owner.page.locator('#preview').waitFor()
  const [created]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith(prefix+'/invitations')&&r.request().method()==='POST'),owner.page.getByRole('button',{name:'确认创建'}).click()])
  assert.equal(created.status(),201);assert.equal(created.headers()['cache-control'],'no-store');const issued=(await created.json()).data
  assert.equal(Date.parse(issued.expires_at)-Date.parse(issued.issued_at),7*86400000)
  await owner.page.locator('#created').waitFor();assert(await owner.page.locator('#issued-code').textContent()===issued.token)
  const createKey=created.request().headers()['idempotency-key'];assert.match(createKey,/^[a-f0-9-]{36}$/)
  const request={actor_id:owner.user,scope:'object',target_id:doc.id,permission:'edit',days:7,max_redemptions:3}
  const replayed=await http(owner.ctx,'/invitations',200,'POST',request,createKey)
  assert.equal(replayed.id,issued.id);assert.equal(replayed.replayed,true);assert(!Object.hasOwn(replayed,'token'))
  await http(owner.ctx,'/invitations',409,'POST',{...request,permission:'read'},createKey)
  await first.page.goto(h.base+'/knowledgeos/invitations');await first.page.locator('#workspace').waitFor()
  await first.page.locator('#token').fill(issued.token);await first.page.getByRole('button',{name:'兑换',exact:true}).click();await first.page.locator('#redeemed').waitFor()
  assert.match(await first.page.locator('#redeemed').textContent(),/阅读与编辑/);assert.equal(await first.page.locator('#token').inputValue(),'')
  assert.equal((await http(first.ctx,original,200)).text,src);await http(rival.ctx,'/invitations/redeem',201,'POST',{actor_id:rival.user,token:issued.token})
  await first.page.getByRole('link',{name:'知识库'}).click();await first.page.getByRole('link',{name:'打开阅读'}).click();await first.page.locator('#version').filter({hasText:doc.version_id}).waitFor()
  const obj=await http(first.ctx,resource,200),edit=await http(first.ctx,resource,200,'PATCH',{expected_revision:obj.revision,body:'Synthetic authorized edit'})
  assert.equal(edit.revision,obj.revision+1);await http(first.ctx,resource,404,'DELETE')
  await http(first.ctx,'/invitations',404,'POST',{actor_id:first.user,scope:'object',target_id:doc.id,permission:'read'})
  const query=await http(first.ctx,'/search',200,'POST',{query:'synthetic original'})
  assert(query.items.some(x=>x.asset_id===doc.id));await http(first.ctx,`/search/${query.query_id}/access`,200)
  const readerUrl=first.page.url();await first.page.locator('#text').filter({hasText:src}).waitFor()
  facts.checks.push('UI issue/redeem and fixed-version reading; live edit allowed and management denied')
  phase='renew and revoke in Chrome';await owner.page.getByRole('button',{name:'管理邀请'}).click();await owner.page.locator('#managed').waitFor()
  const db=dbPath(h.data),dispatch=event=>`/invitations/${issued.id}/${event}`,getManaged=()=>http(owner.ctx,'/invitations/'+issued.id,200)
  const grants=()=>sql(db,'SELECT id,user_id,expires_at,revoked_at FROM invitation_redemptions WHERE invitation_id=? ORDER BY id',[issued.id]).map(g=>({...g}))
  const audit=()=>sql(db,'SELECT actor_id,event,prior_expires_at,expires_at,affected_count FROM invitation_audit WHERE invitation_id=? ORDER BY revision',[issued.id])
  const before=await getManaged(),beforeGrants=grants()
  const title=owner.page.locator('#managed-title'),meta=owner.page.locator('#managed-meta')
  assert.equal(await title.textContent(),issued.title);assert.match(await meta.textContent(),/剩余 7 天/)
  const oldText=(await meta.textContent()).split(' · ')[0]
  assert.equal(await owner.page.locator('#affected li').count(),2)
  for(const g of beforeGrants)assert((await owner.page.locator('#affected').textContent()).includes(g.id.slice(0,8)))
  const manageResponses=[],pageErrors=[]
  owner.page.on('response',r=>{if(new URL(r.url()).pathname.startsWith(prefix+'/invitations'))manageResponses.push({method:r.request().method(),status:r.status()})})
  owner.page.on('pageerror',e=>pageErrors.push(e.name))
  await owner.page.getByRole('button',{name:'预览整组续期'}).click();await owner.page.locator('#confirm-panel').waitFor()
  const preview=await owner.page.locator('#change-preview').textContent();assert.match(preview,/2 份有效派生授权/);assert(preview.includes(oldText))
  const [renewed]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith('/renew')),owner.page.getByRole('button',{name:'确认操作'}).click()]);assert.equal(renewed.status(),200)
  const extended=(await renewed.json()).data
  assert.equal(extended.affected_count,2);assert.equal(Date.parse(extended.expires_at)-Date.parse(issued.expires_at),7*day)
  assert.deepEqual(grants(),beforeGrants.map(g=>({...g,expires_at:extended.expires_at})));assert.equal((await getManaged()).redeemed_count,before.redeemed_count)
  await http(owner.ctx,dispatch('renew'),409,'POST',{actor_id:owner.user,expected_revision:before.revision,days:7})
  try{await owner.page.locator('#managed-meta').filter({hasText:'14 天'}).waitFor({timeout:5000})}
  catch(e){
    const d=await http(owner.ctx,'/invitations/'+issued.id,200)
    facts.renewal_diagnostic={manageResponses,pageErrors,server_time:d.server_time,expires_at:d.expires_at,extended_server_time:extended.server_time,
      meta:await owner.page.locator('#managed-meta').textContent(),status:await owner.page.locator('#status').textContent(),
      workspace_visible:await owner.page.locator('#workspace').isVisible()}
    throw e
  }
  assert.equal(await title.textContent(),issued.title);assert.equal(await owner.page.locator('#affected li').count(),2)
  assert(preview.includes((await meta.textContent()).split(' · ')[0]))
  const added=await http(outsider.ctx,'/invitations/redeem',201,'POST',{actor_id:outsider.user,token:issued.token})
  assert.equal(added.expires_at,extended.expires_at)
  await owner.page.reload();await owner.page.locator('#workspace').waitFor();assert.equal(await owner.page.locator('#issued-code').textContent(),'')
  await owner.page.getByRole('button',{name:'管理邀请'}).click();await owner.page.locator('#managed').waitFor()
  await owner.page.getByRole('button',{name:'预览撤销'}).click();await owner.page.locator('#confirm-panel').waitFor()
  assert.match(await owner.page.locator('#change-preview').textContent(),/同时终止 3 份有效派生授权/)
  const beforeCancel=audit();await owner.page.locator('#cancel-change').click();await owner.page.locator('#confirm-panel').waitFor({state:'hidden'})
  assert.deepEqual(audit(),beforeCancel);await http(first.ctx,original,200)
  await owner.page.getByRole('button',{name:'预览撤销'}).click();await owner.page.locator('#confirm-panel').waitFor()
  const [revoked]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith('/revoke')),owner.page.getByRole('button',{name:'确认操作'}).click()]);assert.equal(revoked.status(),200)
  const revokeReceipt=(await revoked.json()).data;assert.equal(revokeReceipt.affected_count,3)
  for(const a of [first,rival,outsider])await http(a.ctx,original,404)
  await http(first.ctx,resource,404,'PATCH',{expected_revision:edit.revision,body:'Denied write'})
  await http(first.ctx,`/search/${query.query_id}/access`,404)
  assert(!((await http(first.ctx,'/search',200,'POST',{query:'synthetic original'})).items.some(x=>x.asset_id===doc.id)))
  await first.page.bringToFront();await first.page.locator('#version').filter({hasText:doc.version_id}).waitFor({state:'hidden'});assert.equal(await first.page.locator('#text').textContent(),'')
  await first.page.goto(h.base+'/knowledgeos/library');await first.page.goBack();assert.equal(first.page.url(),readerUrl)
  await first.page.locator('#status').filter({hasText:/不可读取|未获|没有|访问|无权/}).waitFor();assert.equal(await first.page.locator('#text').textContent(),'')
  await first.page.reload();await first.page.locator('#status').filter({hasText:/不可读取|未获|没有|访问|无权/}).waitFor();assert.equal(await first.page.locator('#text').textContent(),'')
  assert.equal((await http(owner.ctx,original,200)).text,src)
  const ended=grants();assert.equal(ended.length,3);assert(ended.every(g=>g.revoked_at===revokeReceipt.revoked_at&&g.expires_at===extended.expires_at))
  const auditAfter=audit();assert.deepEqual(auditAfter.map(r=>r.event),['issue','redeem','redeem','renew','redeem','revoke'])
  assert.deepEqual({...auditAfter[3]},{actor_id:owner.user,event:'renew',prior_expires_at:issued.expires_at,expires_at:extended.expires_at,affected_count:2})
  assert.deepEqual({...auditAfter[5]},{actor_id:owner.user,event:'revoke',prior_expires_at:extended.expires_at,expires_at:extended.expires_at,affected_count:3})
  await http(owner.ctx,dispatch('revoke'),404,'POST',{actor_id:owner.user,expected_revision:revokeReceipt.revision})
  await http(first.ctx,'/invitations/redeem',404,'POST',{actor_id:first.user,token:issued.token});assert.deepEqual(audit(),auditAfter)
  assert.deepEqual(sql(db,'PRAGMA foreign_key_check'),[])
  facts.checks.push('UI renews two grants, third redeems to the new cutoff; cancel does not write; revoke hides open, history and reloaded reader plus search; one audit per successful action')
  await owner.page.reload();await owner.page.locator('#workspace').waitFor();assert.equal(await owner.page.locator('#issued-code').textContent(),'')
  const png=await owner.page.screenshot({path:join(out,'management-after-reload.png')});facts.screenshot_sha256=sha(png)

  phase='project scope, issuer authorization and independent sources'
  const checkProject=await projectPolicy({http,upload,db,owner,first,rival,outsider,login})
  facts.checks.push('Member and object invitations require distinct grants; issuer loses management or edit independently; action denials and source composition')

  phase='real concurrent last seat and exact cutoff'
  const draft={actor_id:owner.user,scope:'object',target_id:doc.id,permission:'read'}
  const make=()=>http(owner.ctx,'/invitations',201,'POST',draft)
  const racing=await make(),sixth=await http(owner.ctx,'/invitations',201,'POST',{...draft,permission:'edit'}),unused=await make(),expires=Date.parse(sixth.expires_at)
  assert.equal(Date.parse(sixth.issued_at),t0);assert.equal(expires,t0+7*day)
  const racers=[first,rival],race=await redemptionRace({h,http,db,users:racers,i:racing,mode:'last-seat',at:t0})
  facts.races=[race];const winner=race.statuses.findIndex(code=>code===201),loser=1-winner
  await http(racers[winner].ctx,original,200);await http(racers[loser].ctx,original,404)
  const duplicate=await make(),duplicateContext=await login('first')
  facts.races.push(await redemptionRace({h,http,db,users:[first,duplicateContext],i:duplicate,mode:'same-user',at:t0}))
  facts.checks.push('Two overlapping authenticated Host requests prove last-seat and same-user rules')
  h.clock(t0+1)
  const later=await upload(owner,'split-cutoff.txt','Split-cutoff source')
  const split=await http(owner.ctx,'/invitations',201,'POST',{...draft,target_id:later.id,max_redemptions:2})
  assert.equal(Date.parse(split.expires_at),expires+1)
  h.clock(t0+6*day);const daySix=await login('first')
  await daySix.page.goto(h.base+'/knowledgeos/invitations');await daySix.page.locator('#workspace').waitFor()
  await daySix.page.locator('#token').fill(sixth.token)
  const [sixthResponse]=await Promise.all([daySix.page.waitForResponse(r=>r.url().endsWith('/invitations/redeem')),daySix.page.getByRole('button',{name:'兑换',exact:true}).click()])
  assert.equal(sixthResponse.status(),201);const converted=(await sixthResponse.json()).data
  await daySix.page.locator('#redeemed').filter({hasText:'剩余 1 天'}).waitFor()
  assert.equal(Date.parse(converted.expires_at)-Date.parse(converted.server_time),day)

  phase='known deadline clears an offline reader'
  h.clock(expires-1000);const near=await login('first'),reader=near.page
  const u=h.base+'/knowledgeos/reader?'+new URLSearchParams({asset:doc.id,version:doc.version_id,unit:'1'})
  await reader.clock.install({time:new Date(expires-1000)});await reader.clock.pauseAt(new Date(expires-1000+250))
  await reader.goto(u);await reader.locator('#text').filter({hasText:src}).waitFor()
  await near.ctx.setOffline(true);await reader.clock.runFor(1005)
  assert.match(await reader.locator('#status').textContent(),/读取授权已到期/);assert.equal(await reader.locator('#text').textContent(),'')
  await near.ctx.setOffline(false)

  phase='server cutoff before at and after'
  h.clock(expires-1)
  await checkProject(false)
  assert.equal((await http(near.ctx,original,200)).text,src)
  const pre=await http(near.ctx,resource,200),updated=await http(near.ctx,resource,200,'PATCH',{expected_revision:pre.revision,body:'Allowed before invitation cutoff'})
  const access=original.replace('/reader?unit=1','/reader-access'),boundary=await http(near.ctx,access,200)
  assert.equal(Date.parse(boundary.server_time),expires-1);assert.equal(Date.parse(boundary.read_expires_at),expires)
  const nearRival=await login('rival');facts.races.push(await redemptionRace({h,http,db,users:[near,nearRival],i:unused,mode:'both-expired',at:expires-1}))
  await http(near.ctx,'/me',200);await http(near.ctx,original,404)
  await checkProject(true)
  await http(near.ctx,resource,404,'PATCH',{expected_revision:updated.revision,body:'Denied at cutoff'})
  await http(near.ctx,'/invitations/redeem',404,'POST',{actor_id:near.user,token:unused.token})
  facts.races.push(await redemptionRace({h,http,db,users:[near,nearRival],i:split,mode:'split-cutoff',at:expires}))
  await http(near.ctx,'/me',200);await http(near.ctx,original,404)
  await http(near.ctx,`/assets/${later.id}/versions/${later.version_id}/reader?unit=1`,404)
  await http(near.ctx,resource,404,'PATCH',{expected_revision:updated.revision,body:'Denied after cutoff'})
  const finalOwner=await login('owner');assert.equal((await http(finalOwner.ctx,original,200)).text,src)
  facts.checks.push('Real isolated Host day-six redemption; E-1ms allowed, E and E+1ms denied with current session; offline reader hid locally')
  facts.clock_boundary={issued_at:new Date(t0).toISOString(),expires_at:new Date(expires).toISOString(),read_offsets_ms:[-1,0,1],allowed:[true,false,false],day_six_remaining_ms:day}
  facts.checks.push('Live project membership expires while object invitation remains active; document, reader, object list and assets list all deny')
  phase='SQLite failures before commit and real Host restarts'
  facts.fault_checks=[];await transactionFaults({http,db,h,owner:finalOwner,first:near,doc,faultChecks:facts.fault_checks})
  facts.checks.push('Real SQLite audit insert failure rolls back redemption, renewal and revocation; Host reopen and one successful retry each')
  facts.status='PASS'
}catch(e){facts.status='FAIL';facts.phase=phase;facts.error=String(e.stack);console.error(e);process.exitCode=1}
finally{try{await browser?.close()}finally{try{await h?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(out)}}}
