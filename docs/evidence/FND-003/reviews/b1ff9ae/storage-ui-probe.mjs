import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
const [candidateArgument, outputArgument] = process.argv.slice(2);
if (!candidateArgument || !outputArgument || process.argv.length !== 4) throw new Error('Usage: node [runtime flags] <probe.mjs> <candidate-root> <output-json>');
const candidate = resolve(candidateArgument);
const out = resolve(outputArgument);
const {ProbeStorage,MIGRATION_V1_SQL,MIGRATION_V1_CHECKSUM,MIGRATION_V2_SQL,MIGRATION_V2_CHECKSUM} = await import(pathToFileURL(join(candidate, 'packages/knowledgeos-panel/lib/test-support.js')).href);

const result={candidate:'b1ff9ae506d98420796a6dd84d90e345a6eaa2d7',node:process.version,scope:'synthetic isolated SQLite and exact UI script with controlled DOM/fetch; not full DSH/browser',checks:[]};
const temp=mkdtempSync(join(tmpdir(),'knowledgeos-fnd003-schema-review-'));
try {
 const path=join(temp,'knowledgeos.sqlite'), db=new DatabaseSync(path), now='2026-11-17T06:00:00.000Z';
 const changed=MIGRATION_V2_SQL.replace('login_name TEXT NOT NULL UNIQUE','login_name TEXT NOT NULL');
 if(changed===MIGRATION_V2_SQL)throw new Error('fixture mutation failed');
 db.exec(MIGRATION_V1_SQL);db.exec(changed);
 db.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(1,?,?),(2,?,?)').run(MIGRATION_V1_CHECKSUM,now,MIGRATION_V2_CHECKSUM,now);
 db.prepare('INSERT INTO service_identity(id,service_id,bootstrap_admin_user_id,initialized_at) VALUES(1,?,NULL,NULL)').run(randomUUID());
 db.exec('PRAGMA application_id=0x4b4f5331;PRAGMA user_version=2');
 const beforeJournal=db.prepare('PRAGMA journal_mode').get().journal_mode;db.close();
 const storage=new ProbeStorage({dataDir:temp});const acceptedAtOpen=storage.available;
 const credential={algorithm:'scrypt',version:1,n:131072,r:8,p:1,maxmem:192*1024*1024,salt:Buffer.alloc(16,1),derivedKey:Buffer.alloc(32,2)};
 const input=loginName=>({loginName,displayName:loginName,timezone:'Asia/Shanghai',domains:[],learningTracks:[],goalText:'',now,credential});
 const bootstrap=storage.bootstrap(input('admin'));
 const first=storage.register(input('repeat'));
 const second=storage.register(input('repeat'));
 const inspect=new DatabaseSync(path,{readOnly:true});
 const afterJournal=inspect.prepare('PRAGMA journal_mode').get().journal_mode;
 const duplicates=inspect.prepare('SELECT login_name,count(*) AS count FROM users WHERE login_name=? GROUP BY login_name').get('repeat');
 inspect.close();storage.close();
 result.checks.push({id:'malformed-v2-missing-login-unique',expected:'reject STORAGE_INCOMPATIBLE before writable PRAGMA; never allow duplicate identities',actual:{acceptedAtOpen,bootstrap:bootstrap.kind,first:first.kind,second:second.kind,duplicates,beforeJournal,afterJournal},reproduced:second.kind==='created'&&duplicates.count===2});
} finally {rmSync(temp,{recursive:true,force:true});}

const source=readFileSync(join(candidate,'packages/knowledgeos-panel/src/host/identity-http.ts'),'utf8');
const html=source.split('export function buildAccountHtml(): string {')[1].split('export function buildSetupHtml(): string {')[0];
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const profile={id:'alice-id',login_name:'alice',display_name:'成员甲',role:'member',revision:1,domains:['software_engineering'],learning_tracks:['engineering_practice'],goal_text:'Alice private goal',timezone:'Asia/Shanghai',personal_space_id:'alice-space'};
function ui(fetcher){
 const ids=['state','message','profile','who','domains','tracks','goal','timezone','login_name','login_password','register_name','register_display','register_password','login','register','save','logout'];
 const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',textContent:'',className:id==='profile'?'card hidden':'',style:{},onclick:null}]));
 const context={document:{getElementById:id=>elements[id]},fetch:fetcher};
 return {elements,ready:vm.runInNewContext(script,context,{filename:'exact-production-account-script.js'})};
}
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
let finishLogout;
const logoutGate=new Promise(resolve=>finishLogout=resolve);
const a=ui(async path=>path==='/knowledge/v1/me'?response(200,{data:profile}):path==='/knowledge/v1/auth/logout'?logoutGate:response(500,{}));
await a.ready;
a.elements.login_password.value='Synthetic pending password';a.elements.register_password.value='Synthetic registration draft';
const pendingLogout=a.elements.logout.onclick();
const beforeLogoutResponse={profileClass:a.elements.profile.className,who:a.elements.who.textContent,goal:a.elements.goal.value};
finishLogout(response(204,undefined));await pendingLogout;
const afterLogoutResponse={state:a.elements.state.textContent,profileClass:a.elements.profile.className,who:a.elements.who.textContent,goal:a.elements.goal.value,domains:a.elements.domains.value,tracks:a.elements.tracks.value,loginPasswordRetained:Boolean(a.elements.login_password.value),registerPasswordRetained:Boolean(a.elements.register_password.value)};
result.checks.push({id:'logout-retains-private-drafts-and-passwords',expected:'clear prior private state immediately at logout/switch and clear password fields on exit',actual:{beforeLogoutResponse,afterLogoutResponse},reproduced:afterLogoutResponse.goal===profile.goal_text&&afterLogoutResponse.loginPasswordRetained&&afterLogoutResponse.registerPasswordRetained});

let calls=0,resolveLogin,resolveNewMe,capturedSwitchPatch;
const loginGate=new Promise(resolve=>resolveLogin=resolve),newMeGate=new Promise(resolve=>resolveNewMe=resolve);
const b=ui(async(path,options)=>{
 if(path==='/knowledge/v1/me')return ++calls===1?response(200,{data:profile}):newMeGate;
 if(path==='/knowledge/v1/auth/login')return loginGate;
 if(path==='/knowledge/v1/me/preferences'){
  capturedSwitchPatch=JSON.parse(options.body);
  return response(200,{data:{revision:2}});
 }
 return response(500,{});
});
await b.ready;b.elements.login_name.value='bob';b.elements.login_password.value='Synthetic bob password';
const pendingLogin=b.elements.login.onclick();
const pendingSwitch={profileClass:b.elements.profile.className,who:b.elements.who.textContent,goal:b.elements.goal.value};
resolveLogin(response(200,{data:{...profile,id:'bob-id',login_name:'bob'}}));for(let i=0;i<10;i++)await Promise.resolve();
const afterNewSessionBeforeMe={profileClass:b.elements.profile.className,who:b.elements.who.textContent,goal:b.elements.goal.value};
await b.elements.save.onclick();
resolveNewMe(response(503,{code:'STORAGE_UNAVAILABLE',message:'storage is unavailable'}));await pendingLogin;
result.checks.push({id:'switch-preserves-old-private-view',expected:'clear Alice private state before Bob authentication and disable previous actor mutations while switching',actual:{pendingSwitch,afterNewSessionBeforeMe,savePatchAfterBobLoginBeforeMe:capturedSwitchPatch,final:{state:b.elements.state.textContent,goal:b.elements.goal.value,message:b.elements.message.textContent}},reproduced:pendingSwitch.profileClass==='card'&&pendingSwitch.goal===profile.goal_text&&capturedSwitchPatch.goal_text===profile.goal_text});

for(const status of [401,503]){
 const c=ui(async()=>response(status,{code:status===503?'STORAGE_UNAVAILABLE':'SESSION_EXPIRED',message:status===503?'storage is not configured':'business session required'}));await c.ready;
 result.checks.push({id:`load-${status}`,actual:{state:c.elements.state.textContent,message:c.elements.message.textContent},expected:status===503?'visible storage unavailable condition distinct from logged-out state':'logged-out state'});
}
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
