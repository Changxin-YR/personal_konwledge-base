import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assert,query,digest } from './common.mjs'
function facts(dir) {
  return query(dir,db=>{
    const schema=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all()
    const data={};for(const {type,name} of schema)if(type==='table'){
      const rows=db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(r=>JSON.stringify(r)).sort();data[name]={rows:rows.length,sha256:digest(JSON.stringify(rows))}
    }
    return {version:db.prepare('PRAGMA user_version').get().user_version,application:db.prepare('PRAGMA application_id').get().application_id,ledger:db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),schema,data}
  })
}
export async function migrationCase(dir,log){
  const run=mode=>{const args=[fileURLToPath(new URL('./migration-child.mjs',import.meta.url)),dir,mode],r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});log(mode,{command:[process.execPath,...args],exit:r.status,result:r.status===0?JSON.parse(r.stdout):r.stderr});assert.ifError(r.error);assert.equal(r.status,0,mode+' worker failed')}
  run('seed');const before=facts(dir);log('populated v5',before);assert.equal(before.version,5);assert.equal(before.ledger.length,5);for(const name of ['users','auth_sessions','knowledge_objects'])assert(before.data[name].rows>0)
  run('fault');const failed=facts(dir);log('v6 transaction rolled back',failed);assert.deepEqual(failed,before)
  run('upgrade');const after=facts(dir);log('upgraded',after);assert.equal(after.version,6);assert.equal(after.application,before.application);assert.deepEqual(after.ledger.slice(0,5),before.ledger);assert.equal(after.ledger.length,6);assert.equal(after.ledger[5].version,6);assert.match(after.ledger[5].checksum,/^[a-f0-9]{64}$/)
  for(const row of before.schema)assert.deepEqual(after.schema.find(x=>x.type===row.type&&x.name===row.name),row)
  for(const [name,v] of Object.entries(before.data))if(name!=='schema_migrations')assert.deepEqual(after.data[name],v)
  for(const name of ['jobs','job_runs','job_results','outbox','event_receipts'])assert.equal(after.data[name].rows,0)
  run('reopen');const again=facts(dir);log('reopened',again);assert.deepEqual(again,after)
}
