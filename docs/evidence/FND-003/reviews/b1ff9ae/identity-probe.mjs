import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const [candidateArgument, outputArgument] = process.argv.slice(2);
if (!candidateArgument || !outputArgument || process.argv.length !== 4) throw new Error('Usage: node [runtime flags] <probe.mjs> <candidate-root> <output-json>');
const candidate = resolve(candidateArgument);
const out = resolve(outputArgument);
const { createIdentityHandlers, isLoopbackAddress } = await import(pathToFileURL(join(candidate, 'packages/knowledgeos-panel/src/host/identity-http.ts')).href);
const { IdentityService } = await import(pathToFileURL(join(candidate, 'packages/knowledgeos-panel/src/host/identity.ts')).href);
const { ProbeStorage } = await import(pathToFileURL(join(candidate, 'packages/knowledgeos-panel/lib/test-support.js')).href);

const directory=mkdtempSync(join(tmpdir(),'kos-identity-review-'));
const storage=new ProbeStorage({dataDir:directory});
const service=new IdentityService(storage);
const syntheticPassword='Synthetic password for isolated review 2026!';
const results={candidate:'b1ff9ae506d98420796a6dd84d90e345a6eaa2d7',scope:'controlled HTTP adapter with actual candidate identity handlers, service, KDF and temporary SQLite; not full DSH Host',started_at:new Date().toISOString(),checks:[]};
let server;
try{
 await service.bootstrap({loginName:'reviewadmin',displayName:'合成管理员',password:syntheticPassword,source:'127.0.0.1'});
 let origin='';
 const handlers=createIdentityHandlers({service,origin:()=>origin,host:()=> '0.0.0.0',protocol:()=> 'http:'});
 const routes={'/knowledge/v1/auth/status':'status','/knowledge/v1/auth/register':'register','/knowledge/v1/auth/login':'login','/knowledge/v1/auth/logout':'logout','/knowledge/v1/me':'me','/knowledge/v1/spaces':'spaces'};
 server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const name=routes[path];if(!name){res.statusCode=404;res.end();return;}void handlers[name](req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,cookie)=>{const headers={};if(body!==undefined){headers['Content-Type']='application/json';headers['X-KnowledgeOS-Request']='1';}if(cookie)headers.Cookie=cookie;const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();let data;try{data=JSON.parse(text);}catch{}return {status:response.status,data,cookie:(response.headers.getSetCookie?.()??[]).map(x=>x.split(';')[0]).join('; ')};};
 const registered=await request('/knowledge/v1/auth/register',{login_name:'reviewmember',display_name:'合成成员',password:syntheticPassword,learning_tracks:['architecture_exam']});
 results.checks.push({id:'listener-nonloopback',expected:'identity unavailable when listener host is non-loopback',actual:{declared_listener_host:'0.0.0.0',register_status:registered.status,user_created:!!registered.data?.data?.id},outcome:registered.status===201?'FAIL':'PASS'});
 results.checks.push({id:'register-learning-tracks',expected:['architecture_exam'],actual:registered.data?.data?.learning_tracks,outcome:JSON.stringify(registered.data?.data?.learning_tracks)===JSON.stringify(['architecture_exam'])?'PASS':'FAIL'});
 const signedIn=await request('/knowledge/v1/auth/login',{login_name:'reviewmember',password:syntheticPassword});
 const forgedQuery=await request('/knowledge/v1/me?user_id=another-user&role=admin&service_id=another-service',undefined,signedIn.cookie);
 results.checks.push({id:'unknown-identity-query',expected:'422 INPUT_INVALID for unsupported identity query fields',actual:{status:forgedQuery.status,code:forgedQuery.data?.code,returned_self:forgedQuery.data?.data?.id===registered.data?.data?.id},outcome:forgedQuery.status===422?'PASS':'FAIL'});
 const started=Date.now();const statuses=[];
 for(let i=0;i<31;i++){const response=await request('/knowledge/v1/auth/login',{login_name:'reviewmember',password:syntheticPassword});statuses.push(response.status);}
 results.checks.push({id:'source-attempt-rate-limit',expected:'source exceeding 30 auth attempts/minute receives 429',actual:{attempts:statuses.length,statuses,elapsed_ms:Date.now()-started},outcome:statuses.includes(429)?'PASS':'FAIL'});
 results.checks.push({id:'setup-ipv6-host-check',expected:'IPv6 loopback accepted consistently by setup page',actual:{helper:isLoopbackAddress('::1'),setup_host_check:isLoopbackAddress('::1'.split(':')[0])},outcome:isLoopbackAddress('::1'.split(':')[0])?'PASS':'FAIL'});
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));await service.close();storage.close();rmSync(directory,{recursive:true,force:true});
 results.finished_at=new Date().toISOString();await writeFile(out,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}
