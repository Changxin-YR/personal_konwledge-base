import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie} from '../fnd004/harness.mjs'
import {candidateFacts} from '../integrated-case-proof.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'
import {SCHEMA_VERSION} from '../../packages/knowledgeos-panel/lib/storage.js'

const [candidate,entry]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url))
const self='scripts/project002/host-workflow.mjs',git=(...a)=>execFileSync('git',['--no-optional-locks',...a],{cwd:root})
const hash=b=>createHash('sha256').update(b).digest('hex'),runner_sha256=hash(readFileSync(join(root,self)))
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate);assert.equal(hash(git('show',candidate+':'+self)),runner_sha256)
const {tree,source_tree,entry_sha256,build_sha256}=candidateFacts(root,candidate);assert.equal(entry_sha256,entry)
const parent=join(root,'.cache/project002-host');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'run-'));git('check-ignore','--',join(dir,'summary.json'))
const facts={unit_id:'PROJECT-002',candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256,
  status:'NOT_RUN',scope:'Host checks for inline review workflow; shared material access and scoring not covered',checks:[],boots:[],screens:[],P08:'NOT_RUN',A31:'NOT_RUN'}
const prefix='/knowledge/v1',base=prefix+'/project-tasks',pagePath='/knowledgeos/projects',projectName='Workflow Project',title='Delivery evidence'
const time=Date.parse('2026-11-22T06:00:00.000Z'),due=new Date(time+20000).toISOString(),password=randomUUID()
const marker={'x-knowledgeos-request':'1'},key=()=>({'idempotency-key':randomUUID()})
let phase,host,browser
function ok(id,details={}){facts.checks.push({id,status:'PASS',...details})}
async function boot(){const booted=await host.start();facts.boots.push(booted.pid);return booted}
async function capture(page,name){const png=await page.screenshot({path:join(dir,name),fullPage:true,animations:'disabled'});facts.screens.push({name,sha256:hash(png)})}
function rows(sql,...params){const db=new DatabaseSync(dbPath(host.data),{readOnly:true});try{return db.prepare(sql).all(...params).map(r=>({...r}))}finally{db.close()}}
async function user(name,viewport={width:1280,height:900}){
  const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
  await context.route('**/*',r=>new URL(r.request().url()).origin===host.base?r.continue():r.abort())
  const page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  const me=await context.request.get(host.base+prefix+'/me');assert.equal(me.status(),200)
  return {page,context,id:(await me.json()).data.id}
}
async function request(actor,path,method='GET',data,code=200,error,headers={}){
  const res=await actor.context.request.fetch(host.base+path,{method,data,headers:{...marker,...headers},maxRedirects:0})
  const value=await res.json();assert.equal(res.status(),code,method+' '+path+' '+value.code)
  if(error){assert.equal(value.code,error);assert.equal(value.data,undefined);return}
  if(value.data.actor_id)assert.equal(value.data.actor_id,actor.id)
  return value.data
}
async function open(actor,name=title){
  const {page}=actor;await page.goto(host.base+pagePath);await page.locator('#workspace').waitFor()
  await page.locator('#projects').getByRole('button',{name:projectName,exact:true}).click()
  await page.locator('#tasks').getByRole('button',{name,exact:true}).click();await page.locator('#task-detail').waitFor()
  return page
}
async function uiReview(page,action,met,message,requested){
  await page.locator('#review-verdict').selectOption(action)
  await page.getByRole('checkbox').setChecked(met);await page.getByLabel('标准 1 依据').fill(met?'Confirmed output':'Missing reproduction')
  await page.getByLabel('审核理由').fill(message);if(requested)await page.getByLabel('需补充内容').fill(requested)
  const peer=action.startsWith('peer_');await page.getByRole('button',{name:peer?'保存预审':'保存终审'}).click()
  await page.getByText(peer?'预审已保存。':'终审已保存。',{exact:true}).waitFor()
}

try{
  phase='isolated Host and business accounts';host=await isolate(candidate,entry,{businessClock:time});facts.binding=host.facts
  const firstBoot=await boot(),entrySession=await entryCookie(firstBoot.entry)
  assert.equal((await api(host.port,entrySession.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Project Owner',password})).status,201)
  for(const [login_name,display_name] of [['worker','Assignee'],['peer','Peer'],['outsider','Outsider']])
    assert.equal((await api(host.port,'','POST',prefix+'/auth/register',{login_name,display_name,password})).status,201)
  assert.equal(rows('PRAGMA user_version')[0].user_version,SCHEMA_VERSION)
  const {chromium}=await import(pathToFileURL(host.playwright).href);browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server']});facts.chrome=browser.version()
  const owner=await user('owner'),worker=await user('worker'),peer=await user('peer'),outsider=await user('outsider')
  const {id:p}=await request(owner,prefix+'/projects','POST',{name:projectName},201)
  const invitation=await request(owner,prefix+'/invitations','POST',{actor_id:owner.id,scope:'project',target_id:p,permission:'member',days:2,max_redemptions:2},201,undefined,key())
  for(const member of [worker,peer])await request(member,prefix+'/invitations/redeem','POST',{actor_id:member.id,token:invitation.token},201)
  const criteria={items:[{description:'Reproducible sample',weight:2}],submission_rule:'next_submission'}
  const common={actor_id:owner.id,project_id:p,goal:'Validate result',due_at:due,assignee_id:worker.id,final_reviewer_id:owner.id,criteria}
  const {task:{id}}=await request(owner,base,'POST',{...common,title,peer_reviewer_id:peer.id},201,undefined,key()),path=base+'/'+id

  phase='submission at cutoff; peer may not grant final completion';const wp=await open(worker)
  const draft={actor_id:worker.id,content:'First result <b>literal</b>',expected_revision:1}
  await request(outsider,path+'/history','GET',undefined,404,'NOT_FOUND')
  await request(worker,path+'/submissions','POST',{...draft,submitted_at:due},422,'INVALID_TASK_INPUT',key())
  await request(owner,path+'/submissions','POST',{...draft,actor_id:owner.id},404,'NOT_FOUND',key())
  await request(worker,path+'/submissions','POST',draft,422,'INVALID_TASK_INPUT')
  host.clock(Date.parse(due));await wp.locator('#submission-content').fill(draft.content)
  const seen=wp.waitForRequest(r=>r.url()===host.base+path+'/submissions');await wp.getByRole('button',{name:'提交成果'}).click()
  await wp.getByText('成果已提交。',{exact:true}).waitFor();assert.equal(await wp.locator('.attempt-body b').count(),0)
  const history=()=>request(owner,path+'/history'), first=(await history()).submissions[0]
  assert.equal(first.submitted_at,due);assert.equal(first.timing,'on_time');assert.equal(first.criteria_version,1)
  const replay=await request(worker,path+'/submissions','POST',draft,200,undefined,{'idempotency-key':(await seen).headers()['idempotency-key']})
  assert(replay.replayed);assert.deepEqual(replay.submission,first)
  const good={results:[{criterion:1,met:true,evidence:'Output verified'}],reason:'Acceptable'}
  const finalFirst={actor_id:owner.id,expected_revision:2,submission_id:first.id,action:'final_accept',...good}
  await request(owner,path+'/reviews','POST',finalFirst,409,'TASK_STATE_CONFLICT',key())
  const pp=await open(peer);await uiReview(pp,'peer_pass',true,'Ready for final')
  await pp.getByText('待管理员终审',{exact:true}).waitFor();assert.equal((await request(owner,path)).task.next_actor_id,owner.id)
  await request(peer,path+'/reviews','POST',{...finalFirst,actor_id:peer.id,expected_revision:3},404,'NOT_FOUND',key())
  await capture(pp,'peer-awaiting-final.png');ok('cutoff_and_peer_gate',{server_submitted_at:first.submitted_at,next_state:'awaiting_admin_review'})

  phase='late final return and resubmission';host.clock(Date.parse(due)+5000)
  const op=await open(owner);await uiReview(op,'final_return',false,'Trace is missing','Add exact steps')
  assert.equal((await history()).submissions[0].submitted_at,due);await op.getByText('已退回',{exact:true}).waitFor()
  await op.getByText('需补充：Add exact steps',{exact:true}).waitFor()
  const {task:revised}=await request(owner,path,'PATCH',{actor_id:owner.id,expected_revision:4,criteria:{...criteria,items:[{description:'Exact steps',weight:3}]}})
  assert.equal(revised.criteria_revision,2)
  await open(worker);await wp.locator('#submission-content').fill('Second version with the exact steps');await wp.getByRole('button',{name:'重新提交'}).click()
  await wp.getByText('成果已提交。',{exact:true}).waitFor()
  const second=(await history()).submissions[1];assert.equal(second.criteria_version,2);assert.equal(second.previous_version,1);assert.equal(second.timing,'late')
  await request(peer,path+'/reviews','POST',{actor_id:peer.id,expected_revision:6,submission_id:first.id,action:'peer_pass',...good},409,'TASK_SUBMISSION_CONFLICT',key())
  await open(peer);await uiReview(pp,'peer_pass',true,'Reproduced')
  await open(owner);await uiReview(op,'final_accept',true,'Release verified')
  await op.getByText('已完成',{exact:true}).waitFor();const terminal=await history()
  assert.deepEqual(terminal.submissions,[first,second]);assert.deepEqual(terminal.reviews.map(r=>r.verdict),['pass','return','pass','accept'])
  assert.equal((await request(owner,path)).task.next_actor_id,null)
  assert.equal(rows('SELECT COUNT(*) AS n FROM task_submissions WHERE task_id=?',id)[0].n,2)
  assert.equal(rows('SELECT COUNT(*) AS n FROM task_review_decisions')[0].n,4)
  ok('late_review_does_not_rewrite_original_and_resubmission_pins_new_criteria')

  phase='failure is distinct from returned';const {task:other}=await request(owner,base,'POST',{...common,title:'Failure example',due_at:new Date(Date.parse(due)+60000).toISOString()},201,undefined,key())
  const {submission}=await request(worker,base+'/'+other.id+'/submissions','POST',{actor_id:worker.id,expected_revision:1,content:'Incomplete result'},201,undefined,key())
  const failed=await request(owner,base+'/'+other.id+'/reviews','POST',{actor_id:owner.id,expected_revision:2,submission_id:submission.id,action:'final_fail',
    results:[{criterion:1,met:false,evidence:'No result'}],reason:'Not reproducible'},201,undefined,key())
  assert.equal(failed.task.state,'failed');assert.equal(failed.task.next_actor_id,null)
  await open(owner,'Failure example');await op.getByText('未通过',{exact:true}).waitFor()
  ok('formal_failure_is_not_a_return')

  phase='foreground revocation clears new evidence and restart persists immutable facts';await open(peer);await pp.bringToFront()
  await pp.evaluate(()=>{window.visibilityChanges=0;document.addEventListener('visibilitychange',()=>window.visibilityChanges++)})
  assert.match(await pp.locator('#attempts').textContent(),/Second version/)
  await request(owner,base+'/projects/'+p+'/members','POST',{actor_id:owner.id,remove_member_id:peer.id})
  await pp.getByText('无法确认任务访问权限，已隐藏内容。',{exact:true}).waitFor({timeout:8000})
  assert.equal(await pp.locator('#attempts').textContent(),'');assert.equal(await pp.locator('#workflow-action').textContent(),'')
  assert.deepEqual(await pp.evaluate(()=>[document.visibilityState,window.visibilityChanges]),['visible',0])
  await request(peer,path+'/history','GET',undefined,404,'NOT_FOUND')
  await host.stop();await boot();const mobile=await user('owner',{width:421,height:920});await open(mobile)
  assert.deepEqual(await request(mobile,path+'/history'),terminal);assert.deepEqual(rows('PRAGMA foreign_key_check'),[])
  assert(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'workflow page horizontally overflows')
  await capture(mobile.page,'review-history-mobile.png');ok('revocation_and_durable_restart')
  facts.status='PASS'
}catch(error){facts.status='FAIL';facts.failure={phase,message:String(error.message).slice(0,420)};throw error}
finally{await browser?.close();await host?.stop();writeFileSync(join(dir,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({status:facts.status,dir}))}
