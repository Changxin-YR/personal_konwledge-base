// Isolated Host only. Wait after the real search read transaction commits;
// the next transaction gets a fresh real clock. No ACL result is stubbed.
import assert from 'node:assert/strict'
import {existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'

assert(process.env.KO_RUN)
const flag=join(process.env.KO_RUN,'hold-search-scan.json'), spent=flag+'.spent', trace=flag+'.observed'
const prepared=new WeakMap(), slot=new Int32Array(new SharedArrayBuffer(4))
const {prepare,exec}=DatabaseSync.prototype
DatabaseSync.prototype.prepare=function(sql){
  const stmt=prepare.call(this,sql)
  if(!sql.includes('JOIN pdf_pages p')||!sql.includes('JOIN text_blocks b')||!existsSync(flag))return stmt
  const original=stmt.iterate.bind(stmt)
  stmt.iterate=(...values)=>{
    const rows=original(...values), gate=JSON.parse(readFileSync(flag,'utf8'))
    return (function*(){
      let observed=0
      for(const r of rows){if(r.version_id===gate.version && r.text===gate.text)observed++;yield r}
      assert.equal(observed,1,'expected exactly one real source before final ACL recheck')
    })()
  }
  prepared.set(this,true);return stmt
}
DatabaseSync.prototype.exec=function(sql){
  const out=exec.call(this,sql)
  if(sql!=='COMMIT'||!prepared.has(this))return out
  prepared.delete(this)
  const {until,version}=JSON.parse(readFileSync(flag,'utf8')), scannedAt=Date.now()
  assert(until>scannedAt&&until-scannedAt<5000)
  renameSync(flag,spent)
  while(Date.now()<=until)Atomics.wait(slot,0,0,until-Date.now()+2)
  writeFileSync(trace,JSON.stringify({version,scannedAt,expiresAt:until,releasedAt:Date.now()}),{flag:'wx'})
  return out
}
