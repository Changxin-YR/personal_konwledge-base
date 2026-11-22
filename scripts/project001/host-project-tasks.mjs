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

const [candidate,entry]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url))
const self='scripts/project001/host-project-tasks.mjs',git=(...a)=>execFileSync('git',['--no-optional-locks',...a],{cwd:root})
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),runner_sha256=sha(readFileSync(join(root,self)))
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate);assert.equal(sha(git('show',candidate+':'+self)),runner_sha256)
const {tree,source_tree,entry_sha256,build_sha256}=candidateFacts(root,candidate);assert.equal(entry_sha256,entry)
const parent=join(root,'.cache/project001-host');mkdirSync(parent,{recursive:true});const out=mkdtempSync(join(parent,'run-'))
git('check-ignore','--',join(out,'summary.json'))
const facts={unit_id:'PROJECT-001',candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256,
  scope:'Isolated Host with business clock, Chrome and SQLite; no models',status:'NOT_RUN',T01:'NOT_RUN',T02:'NOT_RUN',A30:'NOT_RUN',A51:'NOT_RUN',checks:[],boots:[],screens:[]}
const prefix='/knowledge/v1',taskApi=prefix+'/project-tasks',webPath='/knowledgeos/projects',invitePath=prefix+'/invitations'
const clock=Date.parse('2026-11-22T04:00:00.000Z'),password=randomUUID(),marker={'x-knowledgeos-request':'1'}
let host,browser,test,phase
const ok=(id,details={})=>facts.checks.push({id,status:'PASS',...details})
const body=(actor,rest)=>({actor_id:actor.id,...rest})
const rows=(statement,...args)=>{const db=new DatabaseSync(dbPath(host.data),{readOnly:true});try{return db.prepare(statement).all(...args).map(row=>({...row}))}finally{db.close()}}
async function boot(){const started=await host.start();facts.boots.push(started.pid);return started}
async function login(name,viewport={width:1340,height:930}){
  const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai',serviceWorkers:'block'})
  await context.route('**/*',r=>new URL(r.request().url()).origin===host.base?r.continue():r.abort())
  const page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password);await page.locator('#login').click();await page.locator('#profile').waitFor()
  const response=await context.request.get(host.base+prefix+'/me');assert.equal(response.status(),200)
  return {context,page,id:(await response.json()).data.id}
}
async function request(actor,path,method='GET',data,expected=200,error,headers={}){
  const result=await actor.context.request.fetch(host.base+path,{method,data,headers:{...marker,...headers},maxRedirects:0})
  const value=await result.json();assert.equal(result.status(),expected,method+' '+path+' '+value.code)
  if(error){assert.equal(value.code,error);assert.equal(value.data,undefined);return}
  if(value.data.actor_id)assert.equal(value.data.actor_id,actor.id)
  return value.data
}
async function capture(page,name){const data=await page.screenshot({path:join(out,name),fullPage:true,animations:'disabled'});facts.screens.push({name,sha256:sha(data)})}
async function open(actor,project){await actor.page.goto(host.base+webPath);await actor.page.locator('#workspace').waitFor();if(project){await actor.page.locator('#projects').getByRole('button',{name:project,exact:true}).click();await actor.page.locator('#membership').waitFor()}}
async function issue(owner,id,days){return request(owner,invitePath,'POST',body(owner,{scope:'project',target_id:id,permission:'member',days,max_redemptions:3}),201,undefined,{'idempotency-key':randomUUID()})}
async function redeem(actor,token,status=201,error){return request(actor,invitePath+'/redeem','POST',body(actor,{token}),status,error)}
const taskRows=()=>rows('SELECT * FROM tasks ORDER BY id')
const criteriaRows=()=>rows('SELECT * FROM task_criteria_versions ORDER BY task_id,version')

try{
  phase='isolated task Host and four real business accounts';host=await isolate(candidate,entry,{businessClock:clock});facts.binding=host.facts
  const start=await boot(),cookie=await entryCookie(start.entry)
  assert.equal((await api(host.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Project Owner',password})).status,201)
  for(const [login_name,display_name] of [['worker','Assigned Member'],['peer','Peer Reviewer'],['outsider','Nonmember']])assert.equal((await api(host.port,'','POST',prefix+'/auth/register',{login_name,display_name,password})).status,201)
  assert.equal(rows('PRAGMA user_version')[0].user_version,29)
  const {chromium}=await import(pathToFileURL(host.playwright).href);browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server']});facts.chrome=browser.version()
  const owner=await login('owner'),worker=await login('worker'),peer=await login('peer'),outsider=await login('outsider')
  test='T01';phase='create project from the library collaboration navigation'
  const projectName='Synthetic project', title='Validate delivery', personalTitle='Private self assignment'
  await owner.page.goto(host.base+'/knowledgeos/library');await owner.page.getByRole('link',{name:'项目协作'}).click();await owner.page.locator('#workspace').waitFor()
  await owner.page.locator('#name').fill(projectName);await owner.page.getByRole('button',{name:'创建项目'}).click();await owner.page.locator('#membership').waitFor()
  const project=(await request(owner,taskApi+'/projects')).projects[0], p=project.id
  const workerInvitation=await issue(owner,p,4), peerInvitation=await issue(owner,p,1), oldUnused=await issue(owner,p,4)
  await redeem(worker,workerInvitation.token);await redeem(peer,peerInvitation.token)
  await open(owner,projectName)
  phase='publish and read a real administrator task with immutable criteria'
  assert.equal(await owner.page.locator('#members li').count(),3)
  await owner.page.locator('#title').fill(title);await owner.page.locator('#goal').fill('Verify the test release evidence.')
  await owner.page.locator('#due').fill('2026-11-26T12:00');await owner.page.locator('#assignee').selectOption(worker.id)
  await owner.page.locator('#reviewer').selectOption(owner.id);await owner.page.locator('#peer').selectOption(peer.id)
  await owner.page.locator('#criteria input').first().fill('Original acceptance');await owner.page.locator('#criteria input').last().fill('2')
  const created=owner.page.waitForResponse(r=>r.url()===host.base+taskApi&&r.request().method()==='POST');await owner.page.getByRole('button',{name:'发布任务'}).click()
  const startTask=await created;assert.equal(startTask.status(),201);const initial=(await startTask.json()).data.task,id=initial.id
  await owner.page.locator('#task-detail').waitFor();assert.match(await owner.page.locator('#task-facts').textContent(),/管理员终审/)
  assert.equal(initial.task_kind,'project_admin');assert.equal(initial.state,'assigned');assert.equal(initial.next_actor_id,worker.id)
  assert.equal(initial.due_at,'2026-11-26T04:00:00.000Z');assert.equal(initial.final_reviewer_id,owner.id);assert.equal(initial.peer_reviewer_id,peer.id)
  assert.equal(initial.criteria_history[0].items[0].weight,2)
  await owner.page.locator('#revise').click();await owner.page.locator('#revision-criteria input').first().fill('Updated acceptance');await owner.page.getByRole('button',{name:'保存新版本'}).click()
  await owner.page.getByText('第 2 版 · 适用下次提交',{exact:true}).waitFor()
  const current=(await request(owner,taskApi+'/'+id)).task
  assert.equal(current.revision,2);assert.deepEqual(current.criteria_history[0],initial.criteria_history[0]);assert.equal(current.criteria_history[1].effective_submission_rule,'next_submission')
  assert.equal(taskRows()[0].criteria_revision,2);assert.equal(taskRows()[0].revision,2);assert.equal(taskRows()[0].current_state,'assigned')
  assert.deepEqual(criteriaRows().map(r=>[r.version,JSON.parse(r.acceptance_items)[0].description]),[[1,'Original acceptance'],[2,'Updated acceptance']])
  await request(owner,taskApi+'/'+id,'PATCH',body(owner,{expected_revision:1,criteria:{items:[{description:'Stale',weight:1}],submission_rule:'next_submission'}}),409,'TASK_REVISION_CONFLICT')
  await capture(owner.page,'project-task-desktop.png')
  const protectedRows=taskRows(),protectedCriteria=criteriaRows();const valid={project_id:p,title:'Another assignment',goal:'Confirm current access',due_at:initial.due_at,
    assignee_id:worker.id,final_reviewer_id:owner.id,criteria:{items:[{description:'Reproducible',weight:1}],submission_rule:'next_submission'}}
  await request(outsider,taskApi+'?project_id='+p,'GET',undefined,404,'NOT_FOUND');await request(outsider,taskApi+'/'+id,'GET',undefined,404,'NOT_FOUND')
  await request(outsider,taskApi,'POST',body(outsider,valid),404,'NOT_FOUND',{'idempotency-key':randomUUID()})
  await request(outsider,taskApi+'/'+id+'/claim','POST',body(outsider,{}),404,'NOT_FOUND');await request(outsider,taskApi+'/'+id,'PATCH',body(outsider,{expected_revision:2,criteria:valid.criteria}),404,'NOT_FOUND')
  await request(worker,taskApi,'POST',body(owner,valid),409,'ACTOR_MISMATCH',{'idempotency-key':randomUUID()})
  await request(owner,taskApi,'POST',body(owner,{...valid,final_reviewer_id:peer.id}),422,'TASK_REVIEW_POLICY_REJECTED',{'idempotency-key':randomUUID()})
  assert.deepEqual(taskRows(),protectedRows);assert.deepEqual(criteriaRows(),protectedCriteria)
  await open(worker,projectName);await worker.page.locator('#tasks').getByRole('button',{name:title}).click();await worker.page.locator('#task-detail').waitFor()
  assert.equal(await worker.page.locator('#dispatch').isVisible(),false);assert.equal(await worker.page.locator('#revise').isVisible(),false)
  ok('authorized_assignment_and_versioning',{revisions:[1,2],forged_or_stale_writes:0})
  facts.T01='PASS'

  test='T02';phase='absolute invitation expiry and member removal';host.clock(Date.parse(peerInvitation.expires_at))
  await request(peer,taskApi+'/'+id,'GET',undefined,404,'NOT_FOUND')
  await request(owner,taskApi,'POST',body(owner,{...valid,peer_reviewer_id:peer.id}),409,'TASK_MEMBER_UNAVAILABLE',{'idempotency-key':randomUUID()})
  await open(peer);assert.equal(await peer.page.locator('#projects').getByRole('button',{name:projectName}).count(),0)
  const personal=(await request(worker,taskApi,'POST',body(worker,{...valid,project_id:null,title:personalTitle,assignee_id:worker.id,final_reviewer_id:worker.id}),201,undefined,{'idempotency-key':randomUUID()})).task
  await request(owner,taskApi+'/'+personal.id,'GET',undefined,404,'NOT_FOUND')
  const personalObject=(await request(worker,prefix+'/objects','POST',{title:'Private material',body:'Should not join the project'},201)).id
  await open(owner,projectName);const memberRow=owner.page.locator('#members li').filter({hasText:'Assigned Member'})
  await memberRow.getByRole('button',{name:'移除',exact:true}).click();await owner.page.locator('#remove-confirm').click()
  await owner.page.getByText('项目成员已移除。',{exact:true}).waitFor()
  await request(worker,taskApi+'/'+id,'GET',undefined,404,'NOT_FOUND');await request(worker,taskApi+'?project_id='+p,'GET',undefined,404,'NOT_FOUND')
  assert.equal((await request(worker,taskApi+'/'+personal.id)).task.task_kind,'personal')
  assert.equal((await request(worker,prefix+'/objects/'+personalObject)).scope,'personal')
  await request(owner,prefix+'/objects/'+personalObject,'GET',undefined,404,'NOT_FOUND')
  await redeem(worker,oldUnused.token,404,'INVITATION_UNAVAILABLE')
  assert.deepEqual(rows('SELECT user_id,removed_by FROM project_membership_removals'),[{user_id:worker.id,removed_by:owner.id}])
  ok('expired_and_removed_members_cannot_read_or_join_by_old_code',{personal_stays_private:true})

  phase='actual Host restart and independent browser context';await host.stop();await boot()
  const reloaded=await login('owner',{width:421,height:920});await open(reloaded,projectName)
  await reloaded.page.locator('#tasks').getByRole('button',{name:title}).click();await reloaded.page.locator('#task-detail').waitFor()
  assert.deepEqual((await request(reloaded,taskApi+'/'+id)).task,current)
  assert.equal(await reloaded.page.locator('#members li').count(),1)
  assert(await reloaded.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'project page horizontally overflows')
  assert.deepEqual(rows('PRAGMA foreign_key_check'),[]);await capture(reloaded.page,'project-task-mobile.png')
  ok('restart_preserves_assignment_history_and_revocation');facts.T02='PASS';facts.A30='PASS';facts.status='PASS'
}catch(error){if(test)facts[test]='FAIL';facts.status='FAIL';facts.failure={phase,message:error.message.slice(0,400)};throw error}
finally{await browser?.close();await host?.stop();writeFileSync(join(out,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({status:facts.status,T01:facts.T01,T02:facts.T02,A30:facts.A30,out}))}
