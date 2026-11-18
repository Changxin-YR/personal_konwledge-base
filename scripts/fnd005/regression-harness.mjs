/** Adapt the accepted ACL suite to isolated FND005 homes and cumulative v5. */
import { writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { prepareRun,entryCookie,api,login } from './harness.mjs'
export * from '../fnd004/harness.mjs'
export async function bootstrapAndRegister({dataDir,outDir,port}) {
 const run=prepareRun(outDir,port,{fixture:false}),patch=join(run.home,'profiles',run.profile,'cordis.patch.yml')
 writeFileSync(patch,JSON.stringify([{id:'knowledgeos-host',config:{dataDir:resolve(dataDir).replaceAll('\\','/')}}]))
 const host=await run.start(),ownerCookie=(await entryCookie(host.entryUrl)).cookie
 const bootstrap=await api(port,ownerCookie,'POST','/knowledge/v1/auth/bootstrap',{login_name:'admin',display_name:'管理员',password:'Admin password 2026!'})
 const registerAlice=await api(port,'','POST','/knowledge/v1/auth/register',{login_name:'alice',display_name:'甲',password:'Alice password 2026!'})
 const registerBob=await api(port,'','POST','/knowledge/v1/auth/register',{login_name:'bob',display_name:'乙',password:'Bob password 2026!'})
 return {host,ownerCookie,bootstrap,registerAlice,registerBob,admin:await login(port,'admin','Admin password 2026!'),alice:await login(port,'alice','Alice password 2026!'),bob:await login(port,'bob','Bob password 2026!')}
}
