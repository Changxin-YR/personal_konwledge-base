// Serialize only synthetic identifiers, checks and fixed binding facts. Never copy
// HTTP responses, Host diagnostics, native catalog entries or browser artifacts.
import assert from 'node:assert/strict'
import {ids,tools,uuid,sha} from './candidate-live-guards.mjs'
import {operationEvidence} from './candidate-live-capture.mjs'
import {mkdirSync,writeFileSync,readFileSync,renameSync} from 'node:fs'
import {join} from 'node:path'
export function exportProof(p) {
  const out={unit_id:'FND-005',category:'REAL_DEEPSEEK_UI_HTTP_SQLITE'}
  for(const k of ['candidate_sha','tree','upstream']){assert.match(p[k],/^[a-f0-9]{40}$/);out[k]=p[k]}
  for(const k of ['entry_sha256','runtime_sha256','price_approval_sha256','loader_sha256'])if(k in p){assert.match(p[k],/^[a-f0-9]{64}$/);out[k]=p[k]}
  assert(['PASS','FAIL','BLOCKED'].includes(p.status));assert(['STARTUP','PRICE_AND_ROUTE','BROWSER','FINAL_BINDING','COMPLETE'].includes(p.phase))
  Object.assign(out,{status:p.status,phase:p.phase},p.provider===null?{provider:null,model:null}:ids(p))
  for(const k of ['prepare_requests','successful_model_selections','native_dispatches']){assert(Number.isInteger(p[k])&&p[k]>=0&&p[k]<=2);out[k]=p[k]}
  for(const k of ['started_at','finished_at'])out[k]=new Date(p[k]).toISOString()
  if(p.host_pid!==undefined){assert(Number.isSafeInteger(p.host_pid)&&p.host_pid>0);out.host_pid=p.host_pid}
  out.operations=p.operations.map((op,i)=>{assert(i<2 && op.tool===tools[i] && op.revision===i+1 && op.receipts===i && op.ui_reread_and_sql_agree===true && op.http_reread_agrees===true);assert.match(op.object_id,uuid)
    return {...operationEvidence(op,i),tool:tools[i],object_id:op.object_id,revision:i+1,receipts:i,ui_reread_and_sql_agree:true,http_reread_agrees:true}})
  if(out.status==='PASS')assert(out.loader_sha256&&out.loader_sha256===out.entry_sha256&&out.phase==='COMPLETE'&&out.provider&&out.price_approval_sha256&&out.host_pid&&out.prepare_requests===2&&out.native_dispatches===2&&out.successful_model_selections===2&&out.operations.length===2&&out.operations[0].object_id===out.operations[1].object_id)
  return out
}
export function publishProof(run,raw,images) {
  const p=exportProof(raw),stage=join(run,'pending-export'),out=join(run,'export');mkdirSync(stage)
  for(const [i,op] of p.operations.entries()) {
    const bytes=images[i];assert(Buffer.isBuffer(bytes)&&sha(bytes)===op.screenshot_sha256)
    const path=join(stage,op.screenshot);writeFileSync(path,bytes,{flag:'wx'});assert.equal(sha(readFileSync(path)),op.screenshot_sha256)
  }
  writeFileSync(join(stage,'proof.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx'});renameSync(stage,out);return join(out,'proof.json')
}
