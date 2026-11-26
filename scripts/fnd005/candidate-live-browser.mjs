import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {bodies,title,sha,ids,tools,uuid,selection,operation} from './candidate-live-guards.mjs'
import {capture,reread,statusUsage} from './candidate-live-capture.mjs'
import {instructionFor,makePermit} from './candidate-live-egress.mjs'

export async function browserRun({bound,base,entry,run,route,proof,authorize,images,confined}) {
  const {chromium}=await import(pathToFileURL(bound.playwright).href)
  const headers={'x-knowledgeos-request':'1','content-type':'application/json'}
  const owner=await fetch(entry,{redirect:'manual',signal:AbortSignal.timeout(5000)})
  const cookie=owner.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert(cookie)
  const db=new DatabaseSync(join(run,'data','knowledgeos.sqlite'),{readOnly:true});let browser
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,0)
    const createUser=(path,name,password,ownerCookie)=>fetch(base+'/knowledge/v1/auth/'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{...headers,...(ownerCookie?{cookie:ownerCookie}:{})},body:JSON.stringify({login_name:name,display_name:'Synthetic '+name,password})})
    assert.equal((await createUser('bootstrap','testadmin',randomUUID(),cookie)).status,201)
    const login='testmember',pass=randomUUID();assert.equal((await createUser('register',login,pass)).status,201)
    const chromeEnv={};for(const k of ['SystemRoot','PATH','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'])if(process.env[k])chromeEnv[k]=process.env[k]
    Object.assign(chromeEnv,{TEMP:run,TMP:run});const ctx=await chromium.launchPersistentContext(join(run,'browser'),{channel:'chrome',headless:true,serviceWorkers:'block',env:chromeEnv});browser=ctx;const page=await ctx.newPage()
    let pending=false,pageError=false
    page.on('pageerror',()=>{pageError=true})
    await ctx.route('**/*',async intercept=>{
      const req=intercept.request(),u=new URL(req.url());if(u.origin!==base)return intercept.abort()
      if(u.pathname==='/knowledge/v1/ai/prepare') {
        if(!pending||req.method()!=='POST'||proof.prepare_requests>=2)return intercept.abort()
        pending=false;proof.prepare_requests++
      }
      return intercept.continue()
    })
    const response=async path=>{const r=await page.request.get(base+'/knowledge/v1/'+path,{maxRedirects:0});assert.equal(r.status(),200);return r}
    const get=async path=>(await (await response(path)).json()).data
    await page.goto(base+'/knowledgeos/account');await page.locator('#login_name').fill(login);await page.locator('#login_password').fill(pass);await page.locator('#login').click();await page.locator('#profile').waitFor({state:'visible'})
    const me=await get('me');assert.equal(me.role,'member');assert.equal(me.login_name,login)
    const created=await page.request.post(base+'/knowledge/v1/objects',{headers,data:{title,body:bodies[0]},maxRedirects:0});assert.equal(created.status(),201)
    const id=(await created.json()).data.id;assert.match(id,uuid);await page.goto(base+'/knowledgeos/ai');await page.waitForFunction(()=>document.querySelector('#status').textContent==='就绪')
    assert.equal(await page.locator('#target').inputValue(),id);assert.equal(await page.locator('#model').innerText(),'模型：'+route.provider+' / '+route.model)
    for(let i=0;i<2;i++) {
      const who=await get('me'),status=await get('ai/status');assert.equal(who.id,me.id);assert.equal(status.configured,true);assert.deepEqual(ids(status),ids(route));assert.equal(status.attempts,i)
      await page.locator('#instruction').fill(instructionFor(i+1));await page.locator('#key').fill(randomUUID())
      await authorize();assert(!pageError);writeFileSync(join(run,'permit-'+(i+1)),confined?JSON.stringify(makePermit(bound.facts.candidate_sha,route,i+1,id)):'',{flag:'wx'});pending=true
      const wait=(path,click)=>Promise.all([page.waitForResponse(base+'/knowledge/v1/'+path,{timeout:85000}),page.locator(click).click()]).then(([r])=>r)
      const p=await wait('ai/prepare','#prepare');assert.equal(p.status(),200);const prepared=(await p.json()).data
      assert(existsSync(join(run,'consumed-'+(i+1))));assert.equal(proof.prepare_requests,i+1);selection(prepared,route,i,id);proof.successful_model_selections++
      await page.waitForFunction(tool=>document.querySelector('#tool').textContent.includes(tool)&&!document.querySelector('#execute').disabled,tools[i]);const e=await wait('ai/execute','#execute');assert.equal(e.status(),200);const result=(await e.json()).data.result
      await page.waitForFunction(expected=>document.querySelector('#result').textContent.includes(expected),bodies[i]);await page.locator('#read').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('重新读取完成'))
      const {data:http,...httpFacts}=reread(await (await response('objects/'+id)).body()),sql=db.prepare('SELECT id,revision,title,body FROM knowledge_objects WHERE id=?').get(id)
      const receipts=db.prepare('SELECT COUNT(*) AS n FROM ai_tool_mutations WHERE object_id=?').get(id).n
      const opt=page.locator('#objects option:checked');const ui={selected:await opt.getAttribute('value'),attr:await opt.getAttribute('data-revision'),label:await opt.innerText(),input:await page.locator('#revision').inputValue(),target:await page.locator('#target').inputValue(),detail:JSON.parse(await page.locator('#object').innerText())}
      const op=operation(i,id,result,http,sql,ui,receipts);const after=await get('ai/status');assert.equal(after.configured,true);assert.deepEqual(ids(after),ids(route));assert.equal((await get('me')).id,me.id)
      const png=await capture(page,base,route,id,i+1);assert(!pageError);images.push(png)
      proof.operations.push({...op,...httpFacts,usage_before:statusUsage(status,i),usage_after:statusUsage(after,i+1),screenshot_sha256:sha(png)})
    }
  } finally {try{await browser?.close()}finally{db.close()}}
}
