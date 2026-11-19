import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdirSync,readFileSync,writeFileSync,realpathSync,symlinkSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { entryCookie,cookieFromResponse } from '../../fnd003/harness.mjs'
import { api } from '../../fnd004/harness.mjs'
import { assert,root,open,query,snapshot,randomUUID,effects,ended,until,digest } from './common.mjs'

async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const {port}=server.address();await new Promise(r=>server.close(r));return port}
export async function hostCase(test,dir,log) {
  const home=join(dir,'home'),data=join(dir,'data'),profile='knowledgeos-identity-test',p=join(home,'profiles',profile),port=await freePort(),pkg=resolve(root,'packages/knowledgeos-panel');let child,exit
  mkdirSync(join(p,'node_modules'),{recursive:true});mkdirSync(data);symlinkSync(pkg,join(p,'node_modules/knowledgeos-panel'),'junction')
  writeFileSync(join(p,'package.json'),JSON.stringify({name:'isolated-job-test',private:true,dependencies:{'knowledgeos-panel':'link:'+pkg.replaceAll('\\','/')},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','knowledgeos-panel']}}}));writeFileSync(join(p,'cordis.yml'),'[]');writeFileSync(join(p,'cordis.patch.yml'),JSON.stringify([{id:'knowledgeos-host',config:{dataDir:data.replaceAll('\\','/')}}]))
  const start=async()=>{
    const env={};for(const [k,v] of Object.entries(process.env))if(/^(systemroot|comspec|path|pathext|temp|tmp|windir|localappdata|appdata|userprofile|home|programfiles.*|processor_.*|number_of_processors)$/i.test(k))env[k]=v
    Object.assign(env,{DSH_HOME:home,DSH_CLIENT_COMMIT_HASH:'39163dd30f703a79079e2d2446545cff3c453738',TSX_DISABLE_CACHE:'1'})
    const args=['--import','tsx/esm','apps/cli/src/bin.ts','--profile',profile,'--port',String(port),'--no-open'];child=spawn(process.execPath,args,{env,cwd:join(root,'.cache/build/dsh-39163dd'),windowsHide:true,stdio:['ignore','pipe','pipe']});exit=once(child,'exit');let tail='';for(const stream of [child.stderr,child.stdout])stream.on('data',b=>tail=(tail+b.toString()).slice(-32000))
    const entry=await until(()=>{if(child.exitCode!==null||child.signalCode)throw Error('Host exited before readiness: '+child.exitCode);return /dsh web:\s*(\S+)/.exec(tail)?.[1]},'real Host ready',90000)
    const u=new URL(entry);assert(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(Number(u.port),port)
    const resolved=realpathSync(join(p,'node_modules/knowledgeos-panel/lib/index.js'));assert.equal(resolved,realpathSync(join(pkg,'lib/index.js')))
    log('Host ready',{pid:child.pid,port,args,bundle_sha256:digest(readFileSync(resolved))});return (await entryCookie(entry)).cookie
  }
  const stop=async(force=false)=>{if(!child)return;const pid=child.pid;if(child.exitCode===null&&!child.signalCode)assert(child.kill(force?'SIGKILL':'SIGTERM'));const [code,signal]=await exit;log('Host exited',{pid,force,code,signal});child=null}
  const http=async(cookie,method,path,body,status)=>{const r=await api(port,cookie,method,'/knowledge/v1'+path,body);log('HTTP',{method,path,status:r.status,code:r.json?.code});assert([].concat(status).includes(r.status),method+' '+path+' returned '+r.status+' '+(r.json?.code??''));return r}
  const password='Independent synthetic password 2026!'
  const login=async name=>cookieFromResponse(await http('','POST','/auth/login',{login_name:name,password},200))
  const object=async(cookie,extra={})=>(await http(cookie,'POST','/objects',{title:'synthetic',body:'original',...extra},201)).json.data.id
  const enqueue=async(cookie,obj,key=randomUUID())=>(await http(cookie,'POST','/jobs',{object_id:obj,expected_revision:1,idempotency_key:key},[200,201,202])).json.data.id
  const obs=(label,id)=>{const s=snapshot(data,id);log(label,s);return s}
  const wait=async(id,pred,label)=>{const s=await until(()=>{const v=snapshot(data,id);return pred(v)?v:null},label);log(label,s);return s}
  const middle=id=>wait(id,v=>v.state==='running'&&v.checkpoint===1,'live checkpoint')
  const succeeded=id=>wait(id,v=>v.state==='succeeded','succeeded')
  try {
    const owner=await start();await http(owner,'POST','/auth/bootstrap',{login_name:'admin',display_name:'Admin',password},201)
    for(const name of ['alice','bob'])await http('','POST','/auth/register',{login_name:name,display_name:name,password},201)
    const alice=await login('alice'),bob=await login('bob'),obj=await object(alice)
    if(test==='T01') {
      const id=await enqueue(alice,obj),pre=await middle(id);effects(pre,0);assert.equal(pre.attempts,1);assert.equal(pre.runs[0].ended_at,null);const old=child.pid
      await stop(true);assert.deepEqual(obs('durable after hard kill',id),pre);await start();assert.notEqual(child.pid,old)
      const row=await succeeded(id);assert.equal(row.attempts,2);assert.equal(row.runs.length,2);ended(row.runs[0],1,'LEASE_EXPIRED');ended(row.runs[1],2,'succeeded');assert.equal(row.runs[0].start_checkpoint,0);assert.equal(row.runs[1].start_checkpoint,1);assert.notEqual(row.runs[0].worker,row.runs[1].worker);effects(row,1)
      assert.equal((await http(alice,'GET','/jobs/'+id,undefined,200)).json.data.state,row.state)
    } else if(test==='T02') {
      const second=await object(alice),key=randomUUID(),ids=await Promise.all([enqueue(alice,obj,key),enqueue(alice,obj,key)]);const [id]=ids;assert.equal(id,ids[1]);obs('duplicate submissions',id)
      const conflict=await http(alice,'POST','/jobs',{object_id:second,expected_revision:1,idempotency_key:key},409);assert.equal(conflict.json.code,'IDEMPOTENCY_CONFLICT');assert.equal(query(data,db=>db.prepare('SELECT count(*) n FROM jobs').get().n),1)
      const row=await succeeded(id);effects(row,1);const s=open(data),event=row.events[0].event_id;try {s.jobs.dispatch();assert.equal(s.jobs.consume(event),false);assert.equal(s.jobs.consume(event),false);assert.equal(s.jobs.dispatch(),false)} finally {s.close()}
      const after=obs('replayed event',id);effects(after,1);assert.equal(after.receipts.length,1);assert.equal(after.receipts[0].event_id,event);assert.equal(after.receipts[0].consumer_name,'probe');assert(after.events[0].delivered_at);assert.equal((await http(alice,'GET','/jobs/'+id,undefined,200)).json.data.state,after.state)
      for(const limit of [1,3]) {
        const eventJob=await enqueue(alice,obj), fresh=await succeeded(eventJob);assert.equal(fresh.receipts.length,0);await stop(true)
        const bad=open(data,'event:after-receipt'),good=open(data), eid=fresh.events[0].event_id
        try {
          for(let n=1;n<=limit;n++) {
            const now=Date.now();assert.equal(bad.jobs.dispatch(),false);const failed=obs('consumer fault '+n,eventJob), entry=failed.events[0];effects(failed,1);assert.equal(failed.state,'succeeded');assert.equal(entry.failures,n);assert.equal(entry.last_error,'CONSUMER_FAILED');assert.equal(entry.delivered_at,null);assert.equal(failed.receipts.length,0);assert(entry.retry_at>=now+250*n)
            assert.equal(good.jobs.consume(eid),false);assert.deepEqual(snapshot(data,eventJob),failed);await until(()=>Date.now()>entry.retry_at,'retry window')
          }
          if(limit===1){assert.equal(good.jobs.dispatch(),true);assert.equal(good.jobs.consume(eid),false);const recovered=obs('consumer recovered',eventJob);assert.equal(recovered.receipts.length,1);assert.equal(recovered.receipts[0].event_id,eid);assert.equal(recovered.events[0].last_error,null)}
          else {const dead=snapshot(data,eventJob);for(let i=0;i<2;i++){assert.equal(good.jobs.dispatch(),false);assert.equal(good.jobs.consume(eid),false)}assert.deepEqual(obs('exhausted delivery stays put',eventJob),dead)}
        } finally {bad.close();good.close()}
        await start();const inspection=(await http(alice,'GET','/jobs/'+eventJob,undefined,200)).json.data;log('HTTP delivery visibility',inspection.delivery);assert.equal(inspection.delivery.failures,limit);assert.equal(inspection.delivery.last_error,limit===3?'CONSUMER_FAILED':null);assert.equal(inspection.delivery.delivered_at===null,limit===3)
      }
    } else if(test==='T06') {
      effects(await succeeded(await enqueue(alice,obj)),1)
      const project=(await http(alice,'POST','/projects',{name:'synthetic project'},201)).json.data.id
      const shared=await object(alice,{scope:'project',project_id:project}),user=(await http(bob,'GET','/me',undefined,200)).json.data.id
      await http(alice,'POST','/projects/'+project+'/memberships',{user_id:user,role:'member'},204)
      const grant=(await http(alice,'POST','/grants',{object_id:shared,subject_type:'user',subject_id:user,action:'read'},201)).json.data.id
      await http(bob,'GET','/objects/'+shared,undefined,200)
      for(const barrier of ['cancel','revision','acl','session']) {
        const cookie=barrier==='acl'||barrier==='session'?bob:alice,target=barrier==='acl'?shared:barrier==='session'?await object(bob):obj
        const id=await enqueue(cookie,target),pre=await middle(id);effects(pre,0)
        const token=query(data,db=>db.prepare('SELECT lease_token FROM jobs WHERE id=?').get(id).lease_token);assert.equal(digest(token),pre.lease_token)
        if(barrier==='cancel') {await http(cookie,'POST','/jobs/'+id+'/cancel',{},[200,204]);assert.equal(snapshot(data,id).state,'cancelled')}
        if(barrier==='revision') {await http(cookie,'PATCH','/objects/'+target,{expected_revision:1,body:'changed'},200);assert.equal((await http(cookie,'GET','/objects/'+target,undefined,200)).json.data.revision,2)}
        if(barrier==='acl') {await http(alice,'POST','/grants/revoke',{grant_id:grant},204);await http(bob,'GET','/objects/'+target,undefined,404)}
        if(barrier==='session') {await http(bob,'POST','/auth/logout',{},204);await http(bob,'GET','/me',undefined,401)}
        const s=open(data);try {const actual=s.jobs.step(token);assert(['lost','failed'].includes(actual));log('commit after '+barrier,{actual})}finally{s.close()}
        const row=obs('after barrier '+barrier,id),reason={cancel:'CANCELLED',revision:'REVISION_CONFLICT',session:'AUTH_REVOKED',acl:'AUTH_REVOKED'}[barrier];assert.equal(row.state,barrier==='cancel'?'cancelled':'failed');assert.equal(row.last_error,reason);ended(row.runs[0],1,reason);effects(row,0)
      }
    } else throw Error('unknown HTTP case')
  } finally {await stop()}
}
