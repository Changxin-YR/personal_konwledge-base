// Checkpoint smoke only. This does not replace A34, exact-clock or independent acceptance.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie,sql} from '../fnd004/harness.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'

const [candidate,entry,parent='.cache/share001-smoke']=process.argv.slice(2)
const root=fileURLToPath(new URL('../../',import.meta.url)),self='scripts/share001/host-smoke.mjs'
const sha=x=>createHash('sha256').update(x).digest('hex'),runner=sha(readFileSync(join(root,self)))
assert.equal(runner,sha(execFileSync('git',['show',candidate+':'+self],{cwd:root})))
mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(parent,'run-')),prefix='/knowledge/v1',marker={'x-knowledgeos-request':'1'},password=randomUUID()
const t0=Date.now(),day=86_400_000
const facts={candidate_sha:candidate,entry_sha256:entry,runner_sha256:runner,status:'NOT_RUN',scope:'checkpoint_smoke_and_clock_boundaries',T01:'NOT_RUN',T02:'NOT_RUN',A34:'NOT_RUN',checks:[]}
let h,browser,phase='bind and boot'
async function http(ctx,path,code,method='GET',data){
  const r=await ctx.request.fetch(h.base+prefix+path,{method,headers:{...marker,'idempotency-key':randomUUID()},data,maxRedirects:0})
  assert.equal(r.status(),code,method+' '+path);if(code===204)return
  const body=await r.json();return code>=400?body.code:body.data
}
async function login(name,viewport){
  const ctx=await browser.newContext({viewport}),page=await ctx.newPage();await page.goto(h.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  return {ctx,page,user:(await http(ctx,'/me',200)).id}
}
try{
  h=await isolate(candidate,entry,{businessClock:t0});facts.binding=h.facts
  const boot=await h.start(),cookie=await entryCookie(boot.entry)
  assert.equal((await api(h.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})).status,201)
  for(const name of ['first','rival'])assert.equal((await api(h.port,'','POST',prefix+'/auth/register',{login_name:name,display_name:name,password})).status,201)
  const {chromium}=await import(pathToFileURL(h.playwright));browser=await chromium.launch({channel:'chrome',args:['--disable-background-networking']});facts.chrome=browser.version()
  const owner=await login('owner',{width:1280,height:900}),first=await login('first',{width:430,height:840}),rival=await login('rival')
  const src='Invitation smoke synthetic original',upload=await owner.ctx.request.post(h.base+prefix+'/imports',{
    headers:{...marker,'idempotency-key':randomUUID(),'content-type':'text/plain','x-knowledgeos-filename':'invite-source.txt'},data:Buffer.from(src)})
  assert.equal(upload.status(),201);const doc=(await upload.json()).data,resource='/objects/'+doc.id,original='/assets/'+doc.id+'/versions/'+doc.version_id+'/reader?unit=1'
  await http(first.ctx,original,404);await http(rival.ctx,original,404)
  phase='Chrome issue and redeem'
  await owner.page.goto(h.base+'/knowledgeos/library');await owner.page.getByRole('link',{name:'邀请码'}).click();await owner.page.locator('#workspace').waitFor()
  await owner.page.locator('#assets').selectOption(doc.id);await owner.page.locator('#permission').selectOption('edit')
  await owner.page.getByRole('button',{name:'预览',exact:true}).click();await owner.page.locator('#preview').waitFor()
  const [created]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith(prefix+'/invitations')&&r.request().method()==='POST'),owner.page.getByRole('button',{name:'确认创建'}).click()])
  assert.equal(created.status(),201);assert.equal(created.headers()['cache-control'],'no-store');const issued=(await created.json()).data
  assert.equal(Date.parse(issued.expires_at)-Date.parse(issued.issued_at),7*86400000)
  await owner.page.locator('#created').waitFor();assert(await owner.page.locator('#issued-code').textContent()===issued.token)
  await first.page.goto(h.base+'/knowledgeos/invitations');await first.page.locator('#workspace').waitFor()
  await first.page.locator('#token').fill(issued.token);await first.page.getByRole('button',{name:'兑换',exact:true}).click();await first.page.locator('#redeemed').waitFor()
  assert.match(await first.page.locator('#redeemed').textContent(),/阅读与编辑/);assert.equal(await first.page.locator('#token').inputValue(),'')
  assert.equal((await http(first.ctx,original,200)).text,src);await http(rival.ctx,'/invitations/redeem',409,'POST',{actor_id:rival.user,token:issued.token})
  await first.page.getByRole('link',{name:'知识库'}).click();await first.page.getByRole('link',{name:'打开阅读'}).click();await first.page.locator('#version').filter({hasText:doc.version_id}).waitFor()
  const obj=await http(first.ctx,resource,200),edit=await http(first.ctx,resource,200,'PATCH',{expected_revision:obj.revision,body:'Synthetic authorized edit'})
  assert.equal(edit.revision,obj.revision+1);await http(first.ctx,resource,404,'DELETE')
  await http(first.ctx,'/invitations',404,'POST',{actor_id:first.user,scope:'object',target_id:doc.id,permission:'read'})
  facts.checks.push('UI issue/redeem and fixed-version reading; live edit allowed and management denied')
  phase='renew and revoke in Chrome';await owner.page.getByRole('button',{name:'管理邀请'}).click();await owner.page.locator('#managed').waitFor()
  await owner.page.getByRole('button',{name:'预览整组续期'}).click();await owner.page.locator('#confirm-panel').waitFor()
  const [renewed]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith('/renew')),owner.page.getByRole('button',{name:'确认操作'}).click()]);assert.equal(renewed.status(),200)
  const extended=(await renewed.json()).data
  assert.equal(extended.affected_count,1);assert.equal(Date.parse(extended.expires_at)-Date.parse(issued.expires_at),7*day)
  await owner.page.locator('#managed-meta').filter({hasText:'14 天'}).waitFor()
  await owner.page.getByRole('button',{name:'预览撤销'}).click();await owner.page.locator('#confirm-panel').waitFor()
  const [revoked]=await Promise.all([owner.page.waitForResponse(r=>r.url().endsWith('/revoke')),owner.page.getByRole('button',{name:'确认操作'}).click()]);assert.equal(revoked.status(),200)
  await http(first.ctx,original,404);await http(first.ctx,resource,404,'PATCH',{expected_revision:edit.revision,body:'Denied write'})
  assert.equal((await http(owner.ctx,original,200)).text,src)
  const db=dbPath(h.data),grant=sql(db,'SELECT expires_at,revoked_at FROM invitation_redemptions WHERE invitation_id=?',[issued.id])
  assert.equal(grant.length,1);assert(grant[0].revoked_at);assert.deepEqual(sql(db,'SELECT event FROM invitation_audit WHERE invitation_id=? ORDER BY revision',[issued.id]).map(r=>r.event),['issue','redeem','renew','revoke'])
  assert.deepEqual(sql(db,'PRAGMA foreign_key_check'),[])
  facts.checks.push('UI group renewal and revoke; live reads/writes denied after revoke; source and audit preserved')
  await owner.page.reload();await owner.page.locator('#workspace').waitFor();assert.equal(await owner.page.locator('#issued-code').textContent(),'')
  const png=await owner.page.screenshot({path:join(out,'management-after-reload.png')});facts.screenshot_sha256=sha(png)

  phase='real concurrent last seat and exact cutoff'
  const draft={actor_id:owner.user,scope:'object',target_id:doc.id,permission:'read'}
  const make=()=>http(owner.ctx,'/invitations',201,'POST',draft)
  const racing=await make(),sixth=await make(),unused=await make(),expires=Date.parse(sixth.expires_at)
  assert.equal(Date.parse(sixth.issued_at),t0);assert.equal(expires,t0+7*day)
  const racers=[first,rival],race=await Promise.all(racers.map(a=>a.ctx.request.post(h.base+prefix+'/invitations/redeem',{
    headers:marker,data:{actor_id:a.user,token:racing.token}})))
  assert.deepEqual(race.map(r=>r.status()).sort(),[201,409]);const winner=race.findIndex(r=>r.status()===201),loser=1-winner
  assert.equal(sql(db,'SELECT count(*) n FROM invitation_redemptions WHERE invitation_id=?',[racing.id])[0].n,1)
  await http(racers[winner].ctx,original,200);await http(racers[loser].ctx,original,404)
  facts.checks.push('Two concurrent client requests for one seat: only winner received permission')
  h.clock(t0+6*day);const daySix=await login('first')
  const converted=await http(daySix.ctx,'/invitations/redeem',201,'POST',{actor_id:daySix.user,token:sixth.token})
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
  assert.equal((await http(near.ctx,original,200)).text,src)
  const access=original.replace('/reader?unit=1','/reader-access'),boundary=await http(near.ctx,access,200)
  assert.equal(Date.parse(boundary.server_time),expires-1);assert.equal(Date.parse(boundary.read_expires_at),expires)
  h.clock(expires);await http(near.ctx,'/me',200);await http(near.ctx,original,404)
  await http(near.ctx,'/invitations/redeem',404,'POST',{actor_id:near.user,token:unused.token})
  h.clock(expires+1);await http(near.ctx,'/me',200);await http(near.ctx,original,404)
  const finalOwner=await login('owner');assert.equal((await http(finalOwner.ctx,original,200)).text,src)
  facts.checks.push('Real isolated Host day-six redemption; E-1ms allowed, E and E+1ms denied with current session; offline reader hid locally')
  facts.clock_boundary={issued_at:new Date(t0).toISOString(),expires_at:new Date(expires).toISOString(),read_offsets_ms:[-1,0,1],allowed:[true,false,false],day_six_remaining_ms:day}
  facts.status='PASS'
}catch(e){facts.status='FAIL';facts.phase=phase;facts.error=String(e.stack);console.error(e);process.exitCode=1}
finally{try{await browser?.close()}finally{try{await h?.stop()}finally{writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(out)}}}
