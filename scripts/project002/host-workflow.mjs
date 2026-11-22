import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {request as httpRequest} from 'node:http'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie} from '../fnd004/harness.mjs'
import {candidateFacts} from '../integrated-case-proof.mjs'
import {isolate,until} from '../lib002/a07-isolated-host.mjs'
import {SCHEMA_VERSION} from '../../packages/knowledgeos-panel/lib/storage.js'

const [candidate,entry]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url))
const self='scripts/project002/host-workflow.mjs',git=(...a)=>execFileSync('git',['--no-optional-locks',...a],{cwd:root})
const hash=b=>createHash('sha256').update(b).digest('hex'),runner_sha256=hash(readFileSync(join(root,self)))
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate);assert.equal(hash(git('show',candidate+':'+self)),runner_sha256)
const {tree,source_tree,entry_sha256,build_sha256}=candidateFacts(root,candidate);assert.equal(entry_sha256,entry)
const parent=join(root,'.cache/project002-host');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'run-'));git('check-ignore','--',join(dir,'summary.json'))
const facts={unit_id:'PROJECT-002',candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256,
  status:'NOT_RUN',scope:'Host checks for inline and fixed-material review workflow; scoring not covered',checks:[],boots:[],screens:[],P08:'NOT_RUN',A31:'NOT_RUN'}
const prefix='/knowledge/v1',base=prefix+'/project-tasks',pagePath='/knowledgeos/projects',projectName='Workflow Project',title='Delivery evidence'
const time=Date.parse('2026-11-22T06:00:00.000Z'),due=new Date(time+20000).toISOString(),password=randomUUID()
const marker={'x-knowledgeos-request':'1'},key=()=>({'idempotency-key':randomUUID()})
let phase,host,browser
function ok(id,details={}){facts.checks.push({id,status:'PASS',...details})}
async function boot(){const booted=await host.start();facts.boots.push(booted.pid);return booted}
async function capture(page,name){const png=await page.screenshot({path:join(dir,name),fullPage:true,animations:'disabled'});facts.screens.push({name,sha256:hash(png)})}
function rows(sql,...params){const db=new DatabaseSync(dbPath(host.data),{readOnly:true});try{return db.prepare(sql).all(...params).map(r=>({...r}))}finally{db.close()}}
function fixture(sql,...params){const db=new DatabaseSync(dbPath(host.data));try{assert.equal(Number(db.prepare(sql).run(...params).changes),1)}finally{db.close()}}
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
  await page.getByText(peer?'预审已保存。':'终审已保存。',{exact:true}).waitFor().catch(async e=>{throw Error(`${e.message}\nPage status: ${await page.locator('#status').textContent()}`)})
}
async function upload(actor,name,text,prior){
  const res=await actor.context.request.post(host.base+prefix+'/imports',{headers:{...marker,...key(),'content-type':'text/plain',
    'x-knowledgeos-filename':name,...(prior?{'x-knowledgeos-asset-id':prior.id,'x-knowledgeos-expected-version':String(prior.version)}:{})},data:Buffer.from(text)})
  assert.equal(res.status(),201,await res.text());return (await res.json()).data
}
const targetOf=({id,version_id})=>({asset_id:id,version_id,ordinal:1})
const materialUrl=t=>'/knowledgeos/reader?'+new URLSearchParams({asset:t.asset_id,version:t.version_id,unit:t.ordinal})
const materialRead=t=>`${prefix}/assets/${t.asset_id}/versions/${t.version_id}/reader?unit=${t.ordinal}`
async function grantMaterial(issuer,recipient,asset){
  const invitation=await request(issuer,prefix+'/invitations','POST',{actor_id:issuer.id,scope:'object',target_id:asset.id,permission:'read',days:2,max_redemptions:1},201,undefined,key())
  await request(recipient,prefix+'/invitations/redeem','POST',{actor_id:recipient.id,token:invitation.token},201)
  return invitation
}
async function revokeMaterial(issuer,invitation){
  const path=prefix+'/invitations/'+invitation.id,current=await request(issuer,path)
  return request(issuer,path+'/revoke','POST',{actor_id:issuer.id,expected_revision:current.revision},200,undefined,key())
}
async function holdReview(actor,path,data,headers){
  const url=host.base+path,label=randomUUID().replaceAll('-',''),body=Buffer.from(JSON.stringify(data))
  const cookie=(await actor.context.cookies(url)).map(c=>c.name+'='+c.value).join('; ')
  let req
  const outcome=new Promise((resolve,reject)=>{
    req=httpRequest(url,{method:'POST',timeout:20000,headers:{...marker,...headers,cookie,'content-type':'application/json',
      'content-length':body.length,'x-kos-test-arrival':label}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>{
        try{resolve({status:res.statusCode,...JSON.parse(Buffer.concat(chunks))})}catch(e){reject(e)}
      });
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('held review timeout')));req.write(body.subarray(0,10));
  });void outcome.catch(()=>{});
  const trace=()=>host.invitationArrivals().filter(e=>e.label===label).map(e=>e.event)
  try{await Promise.race([until(()=>trace().length===1,'review entered Host before revocation'),outcome.then(r=>assert.fail('premature review '+r.status))]);}
  catch(e){req.destroy();throw e}
  return {outcome,trace,finish:()=>req.end(body.subarray(10)),close:()=>req.destroy()}
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

  phase='acknowledged external block projection, separate from a verdict';
  const {task:blocked}=await request(owner,base,'POST',{...common,title:'External block example',due_at:new Date(Date.parse(due)+60000).toISOString()},201,undefined,key());
  // Seed the acknowledged state only; the separate reporting/acknowledgement workflow is not under test.
  fixture("UPDATE tasks SET current_state='blocked', revision=revision+1 WHERE id=? AND current_state='assigned'",blocked.id);
  assert.equal((await request(owner,base+'/'+blocked.id)).task.state,'blocked');
  assert.deepEqual((await request(owner,base+'/'+blocked.id+'/history')).reviews,[]);
  await open(owner,'External block example');await op.getByText('受阻',{exact:true}).waitFor();
  assert.equal(await op.locator('#review-verdict').count(),0);await capture(op,'external-block-projection.png');
  ok('external_block_projection_is_not_material_wait_or_formal_failure',{setup:'isolated_sqlite_acknowledged_state_fixture'});

  phase='fixed material submission and initial independent peer access';
  const mtitle='Fixed-material review',sentinel='PRIVATE_MATERIAL_EVIDENCE_211',materialName='private-material-211.txt';
  const material=await upload(worker,materialName,sentinel),firstTarget=targetOf(material)
  const otherMaterial=await upload(outsider,'external-material.txt','Other scope')
  const crossProject=await request(worker,prefix+'/projects','POST',{name:'Separate test project'},201);
  const crossAsset=await upload(worker,'cross-project.txt','Readable in the other project');
  fixture("UPDATE knowledge_objects SET scope_kind='project', project_id=? WHERE id=? AND owner_user_id=?",crossProject.id,crossAsset.id,worker.id);
  const grantTime=new Date(Date.parse(due)+5000).toISOString();
  fixture(`INSERT INTO resource_grants(id,service_id,resource_type,resource_id,subject_type,subject_id,action,valid_from,created_at)
    SELECT ?,service_id,'knowledge_object',id,'user',owner_user_id,'read',?,? FROM knowledge_objects WHERE id=?`,randomUUID(),grantTime,grantTime,crossAsset.id);
  await request(worker,materialRead(targetOf(crossAsset)));
  const delivery=await request(owner,base,'POST',{...common,title:mtitle,due_at:new Date(Date.parse(due)+15000).toISOString(),peer_reviewer_id:peer.id},201,undefined,key())
  const mp=base+'/'+delivery.task.id,mtime=delivery.task.due_at;
  const mHistory=a=>request(a,mp+'/history');
  const mDraft={actor_id:worker.id,expected_revision:1,content:sentinel,materials:[firstTarget]}
  for(const material of [targetOf(otherMaterial),targetOf(crossAsset),{...firstTarget,version_id:randomUUID()},{...firstTarget,ordinal:20},{...firstTarget,conversion_id:randomUUID()}])
    await request(worker,mp+'/submissions','POST',{...mDraft,materials:[material]},404,'TASK_MATERIAL_UNAVAILABLE',key());
  await request(worker,mp+'/submissions','POST',{...mDraft,materials:[{...firstTarget,read:true}]},422,'INVALID_TASK_INPUT',key());
  assert.equal(rows('SELECT COUNT(*) AS n FROM task_submissions WHERE task_id=?',delivery.task.id)[0].n,0)
  host.clock(Date.parse(mtime));
  const sourcePage=await worker.context.newPage();await sourcePage.goto(host.base+materialUrl(firstTarget));
  await sourcePage.locator('#task-material-link').waitFor();assert.equal(await sourcePage.locator('#task-material-link').getAttribute('href'),materialUrl(firstTarget));await sourcePage.close()
  await open(worker,mtitle);await wp.locator('#submission-content').fill(sentinel);await wp.locator('#submission-materials').fill(materialUrl(firstTarget));
  await wp.getByRole('button',{name:'提交成果'}).click();await wp.getByText('成果已提交。',{exact:true}).waitFor()
  const firstMaterial=(await mHistory(worker)).submissions[0];assert.deepEqual(firstMaterial.materials,[firstTarget]);assert.equal(firstMaterial.submitted_at,mtime);
  await open(peer,mtitle);await pp.getByText('待材料授权',{exact:true}).waitFor();assert.equal(await pp.locator('#review-verdict').count(),0);
  for(const value of [sentinel,materialName,firstTarget.asset_id,firstTarget.version_id])assert(!JSON.stringify(await mHistory(peer)).includes(value));
  await request(peer,materialRead(firstTarget),'GET',undefined,404,'SOURCE_NOT_FOUND');
  const peerPermit=await grantMaterial(worker,peer,material),ownerPermit=await grantMaterial(worker,owner,material);
  await pp.getByText('待同伴预审',{exact:true}).waitFor();const link=pp.getByRole('link',{name:'打开固定材料 1'});
  assert.equal(await link.getAttribute('href'),materialUrl(firstTarget));
  const newer=await upload(worker,materialName,'CURRENT_MATERIAL_VERSION',material);
  assert.equal((await mHistory(peer)).submissions[0].materials[0].version_id,firstTarget.version_id);
  assert.match(JSON.stringify(await request(peer,materialRead(firstTarget))),new RegExp(sentinel));
  assert.match(JSON.stringify(await request(peer,materialRead(targetOf(newer)))),/CURRENT_MATERIAL_VERSION/);
  await uiReview(pp,'peer_pass',true,'Material checked');await pp.getByText('待管理员终审',{exact:true}).waitFor();
  ok('fixed_version_scope_and_peer_recovery');

  phase='decision prepared before revocation, durable wait and recovery';
  await open(owner,mtitle);await op.getByRole('link',{name:'打开固定材料 1'}).waitFor();await op.bringToFront();
  const activeBefore=(await request(owner,mp)).task,finalDraft={actor_id:owner.id,expected_revision:activeBefore.revision,submission_id:firstMaterial.id,action:'final_accept',...good}
  const blockedKey=key(),staged=await holdReview(owner,mp+'/reviews',finalDraft,blockedKey);
  try{await revokeMaterial(worker,ownerPermit);staged.finish();assert.deepEqual(await staged.outcome,{status:409,code:'TASK_MATERIAL_ACCESS_REQUIRED'});assert.deepEqual(staged.trace(),['entered','completed']);}
  finally{staged.close();}
  for(let i=0;i<2;i++)await request(owner,mp+'/reviews','POST',finalDraft,409,'TASK_MATERIAL_ACCESS_REQUIRED',blockedKey);
  await op.getByText('待材料授权',{exact:true}).waitFor();assert.equal(await op.locator('#review-verdict').count(),0);
  assert.equal(await op.getByRole('link',{name:'打开固定材料 1'}).count(),0);assert(!await op.getByText(sentinel,{exact:true}).count());
  await request(owner,materialRead(firstTarget),'GET',undefined,404,'SOURCE_NOT_FOUND');
  assert.deepEqual(rows('SELECT submission_version,resume_state FROM task_material_waits WHERE task_id=?',delivery.task.id),[{submission_version:1,resume_state:'awaiting_admin_review'}]);
  assert.equal(rows('SELECT COUNT(*) AS n FROM task_review_decisions WHERE submission_id=?',firstMaterial.id)[0].n,1);
  await capture(op,'awaiting-material-access.png');
  await host.stop();await boot();
  assert.equal((await request(owner,mp)).task.state,'awaiting_material_access');
  host.clock(Date.parse(mtime)+5000);await grantMaterial(worker,owner,material);
  const recovered=(await request(owner,mp)).task;assert.equal(recovered.state,'awaiting_admin_review');assert.equal(recovered.next_actor_id,owner.id);
  await request(owner,mp+'/reviews','POST',finalDraft,409,'TASK_REVISION_CONFLICT',blockedKey);
  await open(owner,mtitle);await uiReview(op,'final_return',false,'Old trace is missing','Add the new trace');
  const returned=(await request(owner,mp)).task;assert.equal(returned.state,'returned');
  await request(owner,mp,'PATCH',{actor_id:owner.id,expected_revision:returned.revision,criteria:{...criteria,items:[{description:'Current trace',weight:3}]}});
  assert.deepEqual((await mHistory(owner)).submissions,[firstMaterial]);
  ok('final_rights_rechecked_after_preparation_and_restored_after_restart');

  phase='immutable replacement during wait and stale tabs';
  await revokeMaterial(worker,peerPermit);
  const revisedMaterial=(await request(worker,mp)).task;
  const resubmit={actor_id:worker.id,expected_revision:revisedMaterial.revision,content:'Denied version awaiting a peer grant',materials:[targetOf(newer)]};
  const resubmitKey=key();
  const attempts=await Promise.all([201,200].map(async()=>{
    const r=await worker.context.request.post(host.base+mp+'/submissions',{headers:{...marker,...resubmitKey},data:resubmit});return {status:r.status(),body:await r.json()};
  }));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,201]);assert.equal(attempts[0].body.data.submission.id,attempts[1].body.data.submission.id);
  const secondMaterial=attempts[0].body.data.submission;const waiting=(await request(worker,mp)).task;assert.equal(waiting.state,'awaiting_material_access');
  const replacement=await upload(worker,'replacement-material.txt','Authorized replacement trace');
  await grantMaterial(worker,peer,replacement);const replaceOwner=await grantMaterial(worker,owner,replacement);
  const {submission:thirdMaterial,task:thirdTask}=await request(worker,mp+'/submissions','POST',{actor_id:worker.id,expected_revision:waiting.revision,content:'Replacement trace',materials:[targetOf(replacement)]},201,undefined,key());
  assert.equal(thirdMaterial.previous_version,2);assert.equal(thirdMaterial.criteria_version,2);assert.equal(thirdMaterial.timing,'late');
  const obsolete={actor_id:peer.id,expected_revision:waiting.revision,submission_id:secondMaterial.id,action:'peer_pass',...good};
  await request(peer,mp+'/reviews','POST',obsolete,409,'TASK_MATERIAL_ACCESS_REQUIRED',key());
  await request(peer,mp+'/reviews','POST',{...obsolete,submission_id:thirdMaterial.id},409,'TASK_REVISION_CONFLICT',key());
  const passDraft={...obsolete,expected_revision:thirdTask.revision,submission_id:thirdMaterial.id},peerKey=key();
  const passed=await request(peer,mp+'/reviews','POST',passDraft,201,undefined,peerKey);
  assert.equal(passed.task.state,'awaiting_admin_review');assert.equal((await request(peer,mp+'/reviews','POST',passDraft,200,undefined,peerKey)).replayed,true);
  const finalThird={...finalDraft,expected_revision:passed.task.revision,submission_id:thirdMaterial.id},finalKey=key();
  const otherSession=await user('owner'),loggedOut=await holdReview(otherSession,mp+'/reviews',finalThird,finalKey);
  try{
    const logout=await otherSession.context.request.post(host.base+prefix+'/auth/logout',{headers:marker,data:{}});assert.equal(logout.status(),200);
    loggedOut.finish();assert.deepEqual(await loggedOut.outcome,{status:401,code:'AUTH_REQUIRED'});assert.deepEqual(loggedOut.trace(),['entered','completed']);
  }finally{loggedOut.close();await otherSession.context.close();}
  const finalAccepted=await request(owner,mp+'/reviews','POST',finalThird,201,undefined,finalKey);assert.equal(finalAccepted.task.state,'accepted');
  const full=await mHistory(worker);assert.deepEqual(full.submissions,[firstMaterial,secondMaterial,thirdMaterial]);
  assert.equal(full.submissions[0].criteria_version,1);assert.equal(full.reviews[1].requested_work,'Add the new trace');
  assert.equal(rows('SELECT COUNT(*) AS n FROM task_submission_materials WHERE task_id=?',delivery.task.id)[0].n,3);
  phase='stale successful history response cannot repaint protected material';
  await open(owner,mtitle);await op.bringToFront();
  let captured,deliver,settled;
  const responseCaptured=new Promise(resolve=>{captured=resolve}),deliveryGate=new Promise(resolve=>{deliver=resolve}),deliveryDone=new Promise(resolve=>{settled=resolve});
  const historyRoute='**'+mp+'/history';
  await op.route(historyRoute,async route=>{
    try{const safe=await route.fetch();assert.equal(safe.status(),200);assert.match(await safe.text(),/Replacement trace/);captured();
      await deliveryGate;await route.fulfill({response:safe});}finally{settled();}
  },{times:1});
  try{
    await op.locator('#tasks').getByRole('button',{name:mtitle,exact:true}).click();
    await Promise.race([responseCaptured,until(()=>false,'capture pre-revocation history',8000)]);
    await revokeMaterial(worker,replaceOwner);
    await op.locator('#attempts').filter({hasNotText:'Replacement trace'}).waitFor();
    const lateResponse=op.waitForResponse(r=>r.url().endsWith(mp+'/history')&&r.status()===200);
    deliver();await deliveryDone;await lateResponse;
    await op.getByText('任务已更新，请重新打开查看。',{exact:true}).waitFor();
    assert.equal(await op.getByText('Replacement trace',{exact:true}).count(),0);
    assert.equal(await op.locator('a[href="'+materialUrl(targetOf(replacement))+'"]').count(),0);
  }finally{deliver();await op.unroute(historyRoute);}
  assert(!(await mHistory(owner)).submissions.at(-1).content);
  ok('delivered_obsolete_history_cannot_repaint_material');
  await request(owner,mp+'/reviews','POST',finalThird,409,'TASK_MATERIAL_ACCESS_REQUIRED',finalKey);
  assert.equal((await request(owner,mp)).task.state,'accepted');
  ok('immutable_material_replacement_and_idempotency');

  phase='authorization timeout clears foreground and discards late data';
  await open(peer,mtitle);await pp.bringToFront();await pp.getByRole('link',{name:'打开固定材料 1'}).first().waitFor();
  let release;const held=new Promise(resolve=>{release=resolve});
  const accessRoute='**/knowledge/v1/project-tasks/access?**';
  await pp.route(accessRoute,async route=>{await held;await route.continue().catch(()=>{});});
  try{
    await pp.getByText('无法确认任务访问权限，已隐藏内容。',{exact:true}).waitFor({timeout:8000});
    assert.equal(await pp.locator('#attempts').textContent(),'');
  }finally{release();await pp.unroute(accessRoute);}
  assert.equal(await pp.locator('#workspace').isHidden(),true);
  ok('foreground_timeout_discards_material_and_stale_access_result');

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
  facts.T01=facts.T02=facts.A31=facts.status='PASS'
}catch(error){facts.status='FAIL';facts.failure={phase,message:String(error.message).slice(0,420)};throw error}
finally{await browser?.close();await host?.stop();writeFileSync(join(dir,'summary.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({status:facts.status,dir}))}
