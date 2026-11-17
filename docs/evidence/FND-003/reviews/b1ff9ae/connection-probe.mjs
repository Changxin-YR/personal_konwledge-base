import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
const [candidateArgument, outputArgument] = process.argv.slice(2);
if (!candidateArgument || !outputArgument || process.argv.length !== 4) throw new Error('Usage: node [runtime flags] <probe.mjs> <candidate-root> <output-json>');
const candidate = resolve(candidateArgument);
const out = resolve(outputArgument);
const {apply,inject} = await import(pathToFileURL(join(candidate, 'packages/knowledgeos-panel/src/host/index.ts')).href);
const directory=mkdtempSync(join(tmpdir(),'kos-connection-review-'));
const registered=[];const disposers=[];let origin='';
const ctx={webServer:{host:'127.0.0.1',protocol:'http:',getOrigin:()=>origin,register(route){registered.push(route);return()=>{};}},clientModules:{graph(){return{release:{version:'controlled-adapter'}}}},effect(callback){const disposer=callback();disposers.push(disposer);return disposer;}};
let server;
try{
 apply(ctx,{dataDir:directory});
 server=createServer((req,res)=>{const route=registered.find(r=>r.kind==='exact'&&r.path===new URL(req.url,'http://localhost').pathname);if(!route){res.statusCode=404;res.end();return;}void route.handler(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(origin+'/knowledge/v1/auth/status');const body=await response.json();
 const result={candidate:'b1ff9ae506d98420796a6dd84d90e345a6eaa2d7',scope:'actual candidate apply() with controlled Host/ClientModules Context; only configuration schema dependency stubbed; no real DSH Connection service and not full DSH Host',timestamp:new Date().toISOString(),declared_inject:inject,context_has_connection:Object.hasOwn(ctx,'connection'),registered_identity_routes:registered.filter(r=>r.path.startsWith('/knowledge/v1')).map(r=>({path:r.path,auth:r.auth})),actual:{status:response.status,available:body.data?.available,setup_required:body.data?.setup_required},expected:'identity API unavailable without Connection dependency',outcome:response.status===200&&body.data?.available?'FAIL':'PASS'};
 writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{if(server)await new Promise(resolve=>server.close(resolve));for(const dispose of disposers.reverse())await dispose?.();rmSync(directory,{recursive:true,force:true});}
