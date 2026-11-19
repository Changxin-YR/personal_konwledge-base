import { mkdirSync,writeFileSync,mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostCase } from './host-cases.mjs'
import { storageCase } from './storage-cases.mjs'
import { migrationCase } from './migration.mjs'
const [id,output]=process.argv.slice(2),dir=mkdtempSync(join(tmpdir(),'fnd006-'+id+'-')),events=[]
const log=(label,facts)=>events.push({at:new Date().toISOString(),label,facts});let error
try { if(['T01','T02','T06'].includes(id))await hostCase(id,dir,log);else if(id==='V6')await migrationCase(dir,log);else await storageCase(id,dir,log) }
catch(e){error=e.stack;process.exitCode=1}
mkdirSync(output,{recursive:true});writeFileSync(join(output,id+'.json'),JSON.stringify({id,pid:process.pid,command:[process.execPath,...process.argv.slice(1)],directory:dir,status:error?'FAIL':'PASS',error,events},null,2)+'\n');console.log(id+' '+(error?'FAIL '+error:'PASS'))
