import { fork } from 'node:child_process'
import { once } from 'node:events'
import { assert,lib,open,seed,snapshot,digest,effects,ended,sleep,until,randomUUID,causes } from './common.mjs'

async function race(dir,log) {
  const children=['alpha','beta'].map(name=>fork(new URL('./claim-child.mjs',import.meta.url),[dir,name],{execArgv:[],stdio:['ignore','ignore','inherit','ipc']}))
  const exits=children.map(c=>once(c,'exit'))
  const message=(c,i)=>Promise.race([once(c,'message').then(([v])=>v), exits[i].then(()=>{throw Error('claim process exited without reply')})])
  const timeout=AbortSignal.timeout(10000), limit=new Promise((_,reject)=>timeout.addEventListener('abort',()=>reject(Error('claim race timeout')),{once:true}))
  try {
    const ready=await Promise.race([Promise.all(children.map(message)),limit]); assert(ready.every(x=>x.ready));assert.notEqual(ready[0].pid,ready[1].pid)
    const results=Promise.all(children.map(message)), at=Date.now()+250;children.forEach(c=>c.send({at}))
    const values=await Promise.race([results,limit]); const codes=await Promise.race([Promise.all(exits),limit]);assert(codes.every(([c])=>c===0))
    log('synchronized independent claims',{command:'node claim-child.mjs <isolated-db> <worker>',at,workers:values.map(({claim,...v},i)=>({...v,won:!!claim,exit:codes[i][0]}))});return values
  } finally {children.forEach(c=>{if(c.exitCode===null)c.kill()})}
}
export async function storageCase(test,dir,log) {
  const {actor,object}=await seed(lib,dir), s=open(dir), jobs=s.jobs
  const enqueue=()=>jobs.enqueue(actor,object.id,1,randomUUID())
  const observe=(label,id)=>{const v=snapshot(dir,id);log(label,v);return v}
  const expire=async id=>{const deadline=snapshot(dir,id).lease_until;assert(Number.isSafeInteger(deadline));await sleep(Math.max(0,deadline-Date.now()+15))}
  try {
    if(test==='T03') {
      const id=enqueue();observe('queued',id);const rivals=await race(dir,log), wins=rivals.filter(r=>r.claim);assert.equal(wins.length,1)
      const old=wins[0].claim.token, other=rivals.find(v=>!v.claim).worker;let row=observe('race winner',id);assert.equal(row.lease_token,digest(old));assert.equal(row.attempts,1);assert.equal(row.runs.length,1)
      await expire(id);const next=await until(()=>jobs.claim(other),'lease takeover');assert.equal(next.id,id);assert.notEqual(next.token,old);assert.equal(next.checkpoint,0)
      const before=observe('new lease, checkpoint zero',id);assert.equal(before.lease_token,digest(next.token));assert.equal(before.attempts,2);ended(before.runs[0],1,'LEASE_EXPIRED')
      assert.equal(jobs.renew(old),false);assert.equal(jobs.step(old),'lost');assert.deepEqual(snapshot(dir,id),before)
      assert.equal(jobs.step(next.token),'checkpoint');const mid=observe('new lease, checkpoint one',id);assert.equal(mid.checkpoint,1);assert.equal(jobs.step(old),'lost');assert.deepEqual(snapshot(dir,id),mid)
      assert.equal(jobs.step(next.token),'succeeded');effects(observe('winner committed',id),1)
    } else if(test==='T04') {
      const id=enqueue(), first=jobs.claim('w1');assert.equal(first.id,id);const old=observe('first lease',id)
      await sleep(1000);assert.equal(jobs.renew(first.token),true);const fresh=observe('renewed',id);assert(fresh.lease_until>old.lease_until)
      await sleep(Math.max(0,old.lease_until-Date.now()+30));assert(Date.now()<fresh.lease_until);assert.equal(jobs.claim('contender'),undefined);assert.deepEqual(snapshot(dir,id),fresh)
      for(let n=1;n<=3;n++) {
        await expire(id);assert.equal(jobs.claim('reap'),undefined);const row=observe('expired '+n,id);assert.equal(row.attempts,n);assert.equal(row.runs.length,n);ended(row.runs[n-1],n,'LEASE_EXPIRED');assert.equal(row.last_error,'LEASE_EXPIRED');assert.equal(row.lease_token,null);effects(row,0)
        if(n<3) {assert.equal(row.state,'queued');assert(row.available_at>=row.runs[n-1].ended_at+250);const next=await until(()=>jobs.claim('w'+(n+1)),'retry');assert.equal(next.id,id);const active=observe('reclaimed '+(n+1),id);assert.equal(active.attempts,n+1);assert(active.runs[n].started_at>=row.available_at)}
        else {assert.equal(row.state,'failed');for(let i=0;i<2;i++)assert.equal(jobs.claim('late'),undefined);assert.deepEqual(snapshot(dir,id),row)}
      }
      // Exercise explicit transaction-error retry as well as abandoned leases.
      const retryId=enqueue();for(let n=1;n<=3;n++){const c=await until(()=>jobs.claim('error-worker'),'error retry');assert.equal(c.id,retryId);jobs.retry(c.token);const row=observe('worker error '+n,retryId);ended(row.runs[n-1],n,'WORKER_ERROR');assert.equal(row.state,n===3?'failed':'queued');assert.equal(row.attempts,n);effects(row,0)}
      assert.equal(jobs.claim('late'),undefined)
    } else if(test==='T05') {
      for(const point of ['job:after-result','job:after-outbox']) {
        const id=enqueue(), c=jobs.claim('atomic');assert.equal(c.id,id);assert.equal(jobs.step(c.token),'checkpoint');const before=observe('before '+point,id);effects(before,0)
        const f=open(dir,point);try {assert.throws(()=>f.jobs.step(c.token),e=>{const chain=causes(e);log('injected error',{chain});return chain.some(m=>m.includes(point))})} finally {f.close()}
        assert.deepEqual(observe('rolled back '+point,id),before);assert.equal(jobs.step(c.token),'succeeded');const after=observe('retried '+point,id);assert.equal(after.state,'succeeded');effects(after,1)
      }
    } else throw Error('unknown storage case')
  } finally {s.close()}
}
