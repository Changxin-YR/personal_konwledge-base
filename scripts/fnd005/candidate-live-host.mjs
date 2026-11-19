import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {createServer} from 'node:net'
import {setTimeout as sleep} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {uuid} from './candidate-live-guards.mjs'
const base=()=>join(process.env.LOCALAPPDATA,'KnowledgeOS-CandidateLive')
export function workspace(id) {
  assert.match(id,uuid);const dir=join(base(),id);assert.equal(realpathSync(dir),resolve(dir));assert.equal(readFileSync(join(dir,'run-id'),'utf8'),id)
  assert.equal(realpathSync(join(dir,'home')),join(dir,'home'));return dir
}
export function init() {
  assert.equal(process.platform,'win32'); const id=randomUUID();mkdirSync(base(),{recursive:true});assert.equal(realpathSync(base()),resolve(base()))
  const dir=join(base(),id);mkdirSync(dir);const exe=name=>join(process.env.SystemRoot,'System32',name+'.exe')
  const sid=execFileSync(exe('whoami'),['/user','/fo','csv','/nh'],{encoding:'utf8'}).match(/S-1-[\d-]+/)?.[0]; assert(sid)
  execFileSync(exe('icacls'),[dir,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F'],{stdio:'pipe'})
  mkdirSync(join(dir,'home'));writeFileSync(join(dir,'run-id'),id,{flag:'wx'});return {id,home:join(dir,'home')}
}
async function freePort() {
  const s=createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const port=s.address().port;await new Promise(ok=>s.close(ok));return port
}
export async function withHost(bound,dir,run,mode,fn) {
  // Stock web profile, native credential manager only. Do not read, clone or
  // patch a personal profile. Reject links to another home/profile.
  const home=join(dir,'home'),profile=join(home,'profiles','web');assert.equal(realpathSync(profile),profile)
  const local=name=>fileURLToPath(new URL(name,import.meta.url));const dataDir=join(run,'data');mkdirSync(dataDir)
  const patch=join(run,'overlay.yml');writeFileSync(patch,JSON.stringify([{insert:[{id:'candidate-native',name:local('candidate-live-native.mjs').split(sep).join('/')},{id:'candidate-product',name:bound.entry.split(sep).join('/'),config:{dataDir}}]}]),{flag:'wx'})
  const env={};for(const k of ['SystemRoot','ComSpec','PATH','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'])if(process.env[k])env[k]=process.env[k]
  for(const k of ['USERPROFILE','HOME','LOCALAPPDATA','APPDATA','TEMP','TMP']){env[k]=join(dir,'sandbox-'+k);mkdirSync(env[k],{recursive:true})}
  Object.assign(env,{DSH_HOME:home,DSH_CLIENT_COMMIT_HASH:bound.facts.upstream,KO_ENTRY:bound.entry,KO_HASH:bound.facts.entry_sha256,KO_RUN:run,KO_MODE:mode,TSX_DISABLE_CACHE:'1'})
  const port=await freePort(),base='http://127.0.0.1:'+port
  const child=spawn(process.execPath,['--import',new URL('candidate-live-trace.mjs',import.meta.url).href,'--import','tsx/esm','apps/cli/src/bin.ts','--profile','web','--patch',patch,'--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:bound.runtime,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  let entry=null,buf='',ended=false;const end=new Promise(ok=>{child.once('error',()=>{ended=true;ok()});child.once('close',()=>{ended=true;ok()})})
  function drain(chunk){if(entry)return;buf=(buf+chunk).slice(-16000);const m=/dsh web:\s*(http:\/\/[^\s]+)\s/.exec(buf);if(m){entry=m[1];buf=''}}
  child.stdout.on('data',drain);child.stderr.on('data',drain)
  try {
    for(let i=0;i<450;i++) {assert(!ended);if(entry&&existsSync(join(run,'loaded.json'))&&existsSync(join(run,'route.json')))break;await sleep(200)}
    assert(entry && new URL(entry).origin===base);const load=JSON.parse(readFileSync(join(run,'loaded.json'))),route=JSON.parse(readFileSync(join(run,'route.json')))
    assert.deepEqual(load,{pid:child.pid,hash:bound.facts.entry_sha256});assert.equal(route.pid,child.pid);await fn({entry,base,route,pid:child.pid,loadedHash:load.hash})
  } finally {if(!ended)child.kill();let timer;try{await Promise.race([end,new Promise((_,no)=>{timer=setTimeout(()=>no(Error('HOST_NOT_STOPPED')),15000)})])}finally{clearTimeout(timer)}}
}
