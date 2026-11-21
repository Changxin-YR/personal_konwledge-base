import assert from 'node:assert/strict'
import { spawn,execFileSync } from 'node:child_process'
import { existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,symlinkSync,writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname,join,resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { binding,pkg,root } from '../fnd005/candidate-live-binding.mjs'
import { sha } from '../fnd005/candidate-live-guards.mjs'

export async function until(fn,label,ms=15000){
  const end=Date.now()+ms
  while(Date.now()<end){const v=await fn();if(v)return v;await sleep(30)}
  throw Error('timeout: '+label)
}
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root})
export async function isolate(commit,entryHash,{officeBarrier=false,searchBarrier=false}={}){
  const bound=binding(commit,resolve(process.env.KO_TEST_CACHE??join(root,'.cache')))
  assert.equal(bound.facts.entry_sha256,entryHash)
  const scopes=['scripts/lib002','scripts/fnd003','scripts/fnd004']
  assert.equal(git('status','--porcelain','--untracked-files=all','--',...scopes).toString().trim(),'')
  const helpers={}
  if(searchBarrier){
    const path='scripts/search001/scan-barrier.mjs';helpers['search-barrier']=sha(readFileSync(join(root,path)));assert.equal(helpers['search-barrier'],sha(git('show',commit+':'+path)))
  }
  if(officeBarrier){
    const path='scripts/lib004/office-barrier-preload.mjs';helpers['office-barrier']=sha(readFileSync(join(root,path)));assert.equal(helpers['office-barrier'],sha(git('show',commit+':'+path)))
  }
  for(const name of ['host-acceptance','a07-known-pdf','a07-extractor-preload','a07-isolated-host']){
    const path=`scripts/lib002/${name}.mjs`;helpers[name]=sha(readFileSync(join(root,path)))
    assert.equal(helpers[name],sha(git('show',commit+':'+path)))
  }
  const dir=mkdtempSync(join(realpathSync(tmpdir()),'kos-a07-')),home=join(dir,'home'),data=join(dir,'data')
  const profile='a07-isolated',profileDir=join(home,'profiles',profile),product=join(profileDir,'node_modules/knowledgeos-panel')
  mkdirSync(data)
  for(const path of git('ls-files','--',pkg+'/package.json',pkg+'/cordis.patch.yml',pkg+'/lib').toString().trim().split(/\r?\n/)){
    const dest=join(product,path.slice(pkg.length+1));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(root,path)),{flag:'wx'})
  }
  const stagedEntry=realpathSync(join(product,'lib/index.js'));assert.equal(sha(readFileSync(stagedEntry)),entryHash)
  const parser=Object.fromEntries(['pdf-extractor.js','pdfium.wasm'].map(f=>[f,sha(readFileSync(join(product,'lib',f)))]))
  const deps=join(product,'node_modules/@deepseek-ai');mkdirSync(deps,{recursive:true});symlinkSync(realpathSync(join(bound.runtime,'apps/cli/node_modules/@deepseek-ai/schemastery')),join(deps,'schemastery'),'junction')
  const config=(file,o)=>writeFileSync(join(profileDir,file),JSON.stringify(o))
  config('package.json',{name:profile,private:true,dependencies:{'knowledgeos-panel':'link:'+product.replaceAll('\\','/')},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','knowledgeos-panel']}}})
  config('cordis.yml',[]);config('cordis.patch.yml',[{id:'knowledgeos-host',config:{dataDir:data.replaceAll('\\','/')}}])
  const socket=createServer();await new Promise((ok,no)=>socket.once('error',no).listen(0,'127.0.0.1',ok));const port=socket.address().port;await new Promise(ok=>socket.close(ok))
  const base='http://127.0.0.1:'+port;let host,seq=0,trace
  function events(){
    const f=join(trace,'boundary.jsonl');if(!existsSync(f))return []
    return readFileSync(f,'utf8').split('\n').slice(0,-1).map(s=>JSON.parse(s))
  }
  async function start(flags=[]){
    assert(!host);trace=join(dir,'boot-'+ ++seq);mkdirSync(trace)
    for(const f of flags){assert(['hold3','fail4'].includes(f));writeFileSync(join(trace,f),'')}
    const env={};for(const [k,v] of Object.entries(process.env))if(/^(systemroot|windir|comspec|path|pathext|programfiles.*|processor_.*|number_of_processors)$/i.test(k))env[k]=v
    for(const k of ['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP']){env[k]=join(dir,'env-'+k);mkdirSync(env[k],{recursive:true})}
    Object.assign(env,{DSH_HOME:home,DSH_CLIENT_COMMIT_HASH:bound.facts.upstream,TSX_DISABLE_CACHE:'1',KO_ENTRY:stagedEntry,KO_HASH:entryHash,KO_RUN:trace})
    if(officeBarrier)env.KO_OFFICE_ORIGINALS=join(data,'originals')
    const extra=officeBarrier?['--import',new URL('../lib004/office-barrier-preload.mjs',import.meta.url).href]:[]
    if(searchBarrier)extra.push('--import',new URL('../search001/scan-barrier.mjs',import.meta.url).href)
    const child=spawn(process.execPath,['--import',new URL('../fnd005/candidate-live-trace.mjs',import.meta.url).href,'--import',new URL('a07-extractor-preload.mjs',import.meta.url).href,...extra,'--import','tsx/esm','apps/cli/src/bin.ts','--profile',profile,'--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:bound.runtime,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
    let ended=false,tail='';const done=new Promise(ok=>{child.once('close',(code,signal)=>{ended=true;ok({code,signal})});child.once('error',()=>{ended=true;ok({spawnError:true})})});host={child,done}
    for(const s of [child.stdout,child.stderr])s.on('data',chunk=>{tail=(tail+chunk).slice(-32000)})
    const entry=await until(()=>{assert(!ended,'Host exited before readiness');return existsSync(join(trace,'loaded.json'))&&/dsh web:\s*(http:\/\/[^\s]+)\s/.exec(tail)?.[1]},'bound Host boot',90000)
    assert.equal(new URL(entry).origin,base);assert.deepEqual(JSON.parse(readFileSync(join(trace,'loaded.json'),'utf8')),{pid:child.pid,hash:entryHash})
    return {entry,pid:child.pid}
  }
  async function stop(hard=false){
    if(!host)return;const {child,done}=host
    if(hard)assert(child.exitCode===null&&!child.signalCode,'Host must still be live at kill barrier')
    if(child.exitCode===null&&!child.signalCode)assert(child.kill(hard?'SIGKILL':'SIGTERM'))
    let timer;try{const exit=await Promise.race([done,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('Host did not exit')),15000)})]);host=undefined;return {pid:child.pid,hard,...exit}}finally{clearTimeout(timer)}
  }
  const officeFlag=name=>{assert(officeBarrier&&['hold-cancel','release-cancel','hold-stale','release-stale','fail-result'].includes(name));writeFileSync(join(trace,name),'',{flag:'wx'})}
  const gateSearch=data=>{assert(searchBarrier&&host);writeFileSync(join(trace,'hold-search-scan.json'),JSON.stringify(data),{flag:'wx'})}
  const searchGateFacts=()=>JSON.parse(readFileSync(join(trace,'hold-search-scan.json.observed'),'utf8'))
  return {base,port,data,start,stop,events,officeFlag,gateSearch,searchGateFacts,release:()=>writeFileSync(join(trace,'release3'),'',{flag:'wx'}),
    facts:{...bound.facts,helpers,parser},playwright:bound.playwright}
}
