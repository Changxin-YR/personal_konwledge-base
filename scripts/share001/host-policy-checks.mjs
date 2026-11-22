import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {request} from 'node:http'
import {DatabaseSync} from 'node:sqlite'
import {sql} from '../fnd004/harness.mjs'
import {until} from '../lib002/a07-isolated-host.mjs'

const action=(id,action)=>({object_id:id,action})
const grantSpec=(id,user,permission)=>({...action(id,permission),subject_type:'user',subject_id:user})
const asset=(id,version)=>`/assets/${id}/versions/${version}`
const object=id=>`/objects/${id}`
const issue=(http,a,scope,target_id,permission,options={})=>http(a.ctx,'/invitations',201,'POST',{actor_id:a.user,scope,target_id,permission,...options})
const redeem=(http,a,code,i)=>http(a.ctx,'/invitations/redeem',code,'POST',{actor_id:a.user,token:i.token})
const manage=(http,a,i,status=200)=>http(a.ctx,'/invitations/'+i.id,status)
const change=(http,a,i,event,status=200,extra={})=>http(a.ctx,`/invitations/${i.id}/${event}`,status,'POST',{actor_id:a.user,expected_revision:i.revision,...extra})
const direct=(http,a,id,b,p)=>http(a.ctx,'/grants',201,'POST',grantSpec(id,b.user,p))
const revoke=(http,a,g)=>http(a.ctx,'/grants/revoke',204,'POST',{grant_id:g.id})

function snapshot(db,i){return [sql(db,'SELECT * FROM invitations WHERE id=?',[i.id]),
  sql(db,'SELECT * FROM invitation_redemptions WHERE invitation_id=? ORDER BY id',[i.id]),
  sql(db,'SELECT * FROM invitation_audit WHERE invitation_id=? ORDER BY revision',[i.id]),
  sql(db,`SELECT e.*,o.created_at AS queued_at FROM domain_events e LEFT JOIN domain_event_outbox o USING(event_id)
          WHERE aggregate_type='invitation' AND aggregate_id=? ORDER BY aggregate_revision`,[i.id])]}

async function stagedRequest(h,a,path,method,data,key=randomUUID()){
  const url=h.base+'/knowledge/v1'+path,label=randomBytes(16).toString('hex'),cookies=await a.ctx.cookies(url)
  assert.equal(cookies.filter(c=>/^kos_session_[a-f0-9]+$/.test(c.name)).length,1,'one scoped business cookie expected')
  const body=JSON.stringify(data)
  let req
  const outcome=new Promise((ok,no)=>{
    req=request(url,{method,timeout:20000,headers:{
      cookie:cookies.map(c=>c.name+'='+c.value).join('; '),'x-knowledgeos-request':'1','content-type':'application/json',
      'content-length':Buffer.byteLength(body),'idempotency-key':key,'x-kos-test-arrival':label}},res=>{
        const parts=[];res.on('data',c=>parts.push(c));res.on('error',no);res.on('end',()=>{
          try{ok({status:res.statusCode,data:JSON.parse(Buffer.concat(parts).toString('utf8')).data})}catch(e){no(e)}
        })
      })
    req.on('error',no);req.on('timeout',()=>req.destroy(Error('isolated redemption timed out')))
    req.write(body.slice(0,10))
  })
  void outcome.catch(()=>{})
  return {label,outcome,finish:()=>req.end(body.slice(10)),close:()=>req.destroy()}
}

export async function redemptionRace({h,http,db,users,i,mode,at}){
  assert(['last-seat','same-user','both-expired','split-cutoff'].includes(mode));assert.equal(users.length,2)
  const sameUser=mode==='same-user';assert.equal(users[0].user===users[1].user,sameUser)
  const pending=[]
  try{
    const key=randomUUID()
    for(const user of users)pending.push(await stagedRequest(h,user,'/invitations/redeem','POST',{actor_id:user.user,token:i.token},sameUser?key:undefined))
    const labels=pending.map(p=>p.label),trace=()=>h.invitationArrivals().filter(x=>labels.includes(x.label))
    const premature=p=>p.outcome.then(r=>assert.fail(`redemption returned ${r.status} before the barrier released it`))
    await Promise.race([until(()=>trace().length===2,'both redeem bodies entered the authenticated Host'),...pending.map(premature)])
    assert.deepEqual(trace().map(x=>[x.event,x.at]),[['entered',at],['entered',at]])
    const edge=Date.parse(i.expires_at)
    if(mode==='split-cutoff'){
      assert.equal(at,edge-1);pending[0].finish();assert.equal((await pending[0].outcome).status,201)
      assert.equal(sql(db,'SELECT redeemed_count FROM invitations WHERE id=?',[i.id])[0].redeemed_count,1)
    }
    if(mode==='both-expired'||mode==='split-cutoff'){assert.equal(at,edge-1);h.clock(edge)}
    for(const [idx,p] of pending.entries())if(mode!=='split-cutoff'||idx!==0)p.finish()
    const results=await Promise.all(pending.map(p=>p.outcome)),statuses=results.map(r=>r.status)
    if(mode==='last-seat')assert.deepEqual(statuses.toSorted(),[201,409])
    if(mode==='same-user'){
      assert.deepEqual(statuses.toSorted(),[200,201]);assert.equal(results[0].data.id,results[1].data.id)
      const replay=await redeem(http,users[0],200,i);assert.equal(replay.id,results[0].data.id);assert.equal(replay.replayed,true)
    }
    if(mode==='both-expired')assert.deepEqual(statuses,[404,404])
    if(mode==='split-cutoff')assert.deepEqual(statuses,[201,404])
    const [codes,grants,audit]=snapshot(db,i),winners=results.flatMap((r,idx)=>r.status===201?[users[idx].user]:[])
    assert.equal(codes[0].redeemed_count,winners.length);assert.deepEqual(grants.map(g=>g.user_id),winners)
    assert.deepEqual(audit.map(a=>a.event),winners.length?['issue','redeem']:['issue'])
    const events=snapshot(db,i)[3];assert.equal(events.length,audit.length);assert(events.every(e=>e.queued_at===e.occurred_at))
    if(winners.length)assert.equal(grants[0].expires_at,i.expires_at)
    assert.deepEqual(trace().slice(2).map(x=>[x.event,x.at]),[
      ['completed',mode==='both-expired'?edge:at],['completed',mode==='both-expired'||mode==='split-cutoff'?edge:at]])
    return {mode,statuses,entered_offsets_ms:[at-edge,at-edge],body_completion_offsets_ms:trace().slice(2).map(x=>x.at-edge),successful_grants:grants.length}
  }finally{for(const p of pending)p.close()}
}

export async function straddlingEdit({h,db,actor,doc,revision,edge,advance,facts}){
  const pending=await stagedRequest(h,actor,object(doc.id),'PATCH',{expected_revision:revision,body:'Write held across the share deadline'})
  const trace=()=>h.invitationArrivals().filter(x=>x.label===pending.label).map(x=>[x.event,x.at])
  const read=()=>sql(db,'SELECT body,revision,updated_at FROM knowledge_objects WHERE id=?',[doc.id])
  const before=read()
  try{
    await Promise.race([until(()=>trace().length===1,'slow PATCH enters the authenticated Host'),
      pending.outcome.then(r=>assert.fail(`PATCH returned ${r.status} before request body completion`))])
    assert.deepEqual(trace(),[['entered',edge-1]])
    await advance();pending.finish();const response=await pending.outcome
    assert.deepEqual(trace(),[['entered',edge-1],['completed',edge]])
    const after=read()
    Object.assign(facts,{entered_offset_ms:-1,completed_offset_ms:0,http:response.status,before_revision:before[0].revision,after_revision:after[0].revision})
    assert.equal(response.status,404);assert.deepEqual(after,before)
  }finally{pending.close()}
}

export async function projectPolicy({http,upload,db,owner,first,rival,outsider,login}){
  const p=await http(owner.ctx,'/projects',201,'POST',{name:'Invitation policy project'})
  const separate=await http(outsider.ctx,'/projects',201,'POST',{name:'Unrelated project'})
  const other=await http(outsider.ctx,'/objects',201,'POST',{scope:'project',project_id:separate.id,title:'Other project object',body:'Private to other project'})
  const privateDoc=await upload(outsider,'unshared.txt','Unshared personal text')
  const source='Project invitation policy source',imported=await upload(owner,'project-invite-source.txt',source)
  const doc=await http(owner.ctx,'/objects',201,'POST',{scope:'project',project_id:p.id,object_type:'asset',title:'Project invitation document',body:'Synthetic metadata'})
  // The current import route creates personal assets only. Rebind the actual
  // imported version to a real project object; all ACL changes below use HTTP.
  const conn=new DatabaseSync(db)
  try{
    conn.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE')
    conn.prepare('INSERT INTO assets VALUES(?)').run(doc.id)
    assert.equal(conn.prepare('UPDATE asset_versions SET asset_id=? WHERE id=? AND asset_id=?').run(doc.id,imported.version_id,imported.id).changes,1)
    conn.exec('COMMIT')
  }finally{conn.close()}
  const path=object(doc.id),reader=asset(doc.id,imported.version_id)+'/reader?unit=1',access=reader.replace('/reader?unit=1','/reader-access')
  const member=await issue(http,owner,'project',p.id,'member',{max_redemptions:2})
  const edit=await issue(http,owner,'object',doc.id,'edit',{days:14,max_redemptions:2})
  await redeem(http,first,404,edit);await redeem(http,outsider,404,edit);await http(first.ctx,reader,404)
  await redeem(http,first,201,member);await redeem(http,rival,201,member)
  await http(first.ctx,reader,404);await http(rival.ctx,path,404)
  await http(first.ctx,`/projects/${p.id}/memberships`,404,'POST',{user_id:outsider.user})
  await http(owner.ctx,object(privateDoc.id),404);await http(first.ctx,object(privateDoc.id),404);await http(first.ctx,object(other.id),404)

  const manageGrant=await direct(http,owner,doc.id,first,'manage_share')
  const readGrant=await direct(http,owner,doc.id,first,'read')
  const editGrant=await direct(http,owner,doc.id,first,'edit')
  const lostManage=await issue(http,first,'object',doc.id,'read')
  await revoke(http,owner,manageGrant);await http(first.ctx,path,200)
  const beforeManage=snapshot(db,lostManage);await redeem(http,rival,404,lostManage);assert.deepEqual(snapshot(db,lostManage),beforeManage)
  await direct(http,owner,doc.id,first,'manage_share')
  const lostEdit=await issue(http,first,'object',doc.id,'edit')
  await revoke(http,owner,editGrant);await http(first.ctx,path+'/action',200,'POST',{action:'manage_share'})
  const beforeEdit=snapshot(db,lostEdit);await redeem(http,rival,404,lostEdit);assert.deepEqual(snapshot(db,lostEdit),beforeEdit)

  await redeem(http,rival,201,edit);assert.equal((await http(rival.ctx,reader,200)).text,source)
  const original=await http(rival.ctx,path,200),unchanged=snapshot(db,edit)
  await http(rival.ctx,path,404,'DELETE');await http(rival.ctx,path+'/action',404,'POST',{action:'export'})
  await http(rival.ctx,'/grants',404,'POST',grantSpec(doc.id,outsider.user,'read'))
  for(const url of ['/invitations','/invitations/preview'])
    await http(rival.ctx,url,404,'POST',{actor_id:rival.user,scope:'object',target_id:doc.id,permission:'read'})
  await manage(http,rival,edit,404);await change(http,rival,edit,'renew',404,{days:1});await change(http,rival,edit,'revoke',404)
  await http(rival.ctx,'/invitations/'+edit.id,404,'PATCH',{actor_id:rival.user,scope:'project',target_id:separate.id})
  assert.deepEqual(await http(rival.ctx,path,200),original);assert.deepEqual(snapshot(db,edit),unchanged)

  // Revoke invitation first / direct first on two separate source sets.
  for(const dropInviteFirst of [true,false]){
    const subject=dropInviteFirst?rival:first
    const i=await issue(http,owner,'object',doc.id,'read')
    const g=dropInviteFirst?await direct(http,owner,doc.id,subject,'read'):readGrant
    await redeem(http,subject,201,i)
    const baseline=sql(db,'SELECT expires_at,revoked_at FROM resource_grants WHERE id=?',[g.id])
    const current=await manage(http,owner,i)
    if(dropInviteFirst){
      await change(http,owner,current,'revoke')
      assert.deepEqual(sql(db,'SELECT expires_at,revoked_at FROM resource_grants WHERE id=?',[g.id]),baseline)
      await http(subject.ctx,reader,200);await revoke(http,owner,g)
      await http(subject.ctx,reader,200) // Independently active edit invite still includes read.
    }else{
      await revoke(http,owner,g);await http(subject.ctx,reader,200)
      assert.equal(sql(db,'SELECT expires_at FROM invitation_redemptions WHERE invitation_id=?',[i.id])[0].expires_at,i.expires_at)
      await change(http,owner,current,'revoke');await http(subject.ctx,reader,404)
    }
  }
  const separateEdit=await direct(http,owner,doc.id,first,'edit')
  const separateRead=await issue(http,owner,'object',doc.id,'read');await redeem(http,first,201,separateRead)
  await http(first.ctx,path,200)
  await http(first.ctx,path,200,'PATCH',{expected_revision:original.revision,body:'Read and edit from different live sources'})
  await revoke(http,owner,separateEdit);const current=await http(first.ctx,path,200)
  await http(first.ctx,path,404,'PATCH',{expected_revision:current.revision,body:'Read source has no edit'})
  assert.equal((await http(rival.ctx,access,200)).read_expires_at,member.expires_at)

  return async expired=>{
    const a=await login('rival');await http(a.ctx,'/me',200)
    if(!expired){assert.equal((await http(a.ctx,reader,200)).text,source);return}
    await http(a.ctx,reader,404);await http(a.ctx,path,404)
    assert.equal(sql(db,'SELECT expires_at FROM invitation_redemptions WHERE invitation_id=?',[edit.id])[0].expires_at,edit.expires_at)
    assert(!((await http(a.ctx,'/assets',200)).items.some(x=>x.id===doc.id)))
    assert(!(await http(a.ctx,'/objects',200)).some(x=>x.id===doc.id))
  }
}

export async function transactionFaults({http,db,h,owner,first,doc,faultChecks}){
  const i=await issue(http,owner,'object',doc.id,'read')
  for(const event of ['redeem','renew','revoke']){
    const before=snapshot(db,i),current=await manage(http,owner,i)
    const conn=new DatabaseSync(db)
    try{conn.exec(`CREATE TRIGGER share_test_failure BEFORE INSERT ON domain_event_outbox
                   WHEN (SELECT event_type FROM domain_events WHERE event_id=NEW.event_id)='knowledgeos.invitation.${event}'
                   BEGIN SELECT RAISE(ABORT,'synthetic rollback check'); END`)}finally{conn.close()}
    if(event==='redeem')await redeem(http,first,503,i)
    else await change(http,owner,current,event,503,event==='renew'?{days:1}:{})
    assert.deepEqual(snapshot(db,i),before)
    await h.stop()
    const cleanup=new DatabaseSync(db)
    try{cleanup.exec('DROP TRIGGER share_test_failure')}finally{cleanup.close()}
    await h.start();assert.deepEqual(snapshot(db,i),before)
    await http(owner.ctx,'/me',200);await http(first.ctx,'/me',200)
    if(event==='redeem')await redeem(http,first,201,i)
    else await change(http,owner,current,event,200,event==='renew'?{days:1}:{})
    const snapshotAfter=snapshot(db,i)
    assert.equal(snapshotAfter[2].filter(a=>a.event===event).length,1)
    const stored=snapshotAfter[3].filter(e=>e.event_type==='knowledgeos.invitation.'+event)
    assert.equal(stored.length,1);assert.equal(stored[0].occurred_at,stored[0].queued_at)
    faultChecks.push({event,failure_http:503,snapshot_unchanged_after_reopen:true,successful_audit_and_outbox_rows_after_retry:1})
  }
  const stored=snapshot(db,i)
  assert.equal(stored[0][0].token_hash,createHash('sha256').update(i.token).digest('hex'))
  assert(!JSON.stringify(stored).includes(i.token));assert.deepEqual(sql(db,'PRAGMA foreign_key_check'),[])
}
