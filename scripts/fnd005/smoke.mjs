import { join } from 'node:path'
import { prepareRun, accounts, api, stopHost } from './harness.mjs'
const run=prepareRun('docs/evidence/FND-005/runs/smoke')
let host
try {
 const c=await accounts(run); host=c.host
 console.log('ai', (await api(run.port,c.alice.cookie,'GET','/knowledge/v1/ai/status')).json)
 const o=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/objects',{title:'合成测试对象',body:'合成正文'}); console.log('object',o.status)
 const p=await api(run.port,c.alice.cookie,'POST','/knowledge/v1/ai/prepare',{request_id:'smoke',object_id:o.json.data.id,expected_revision:1,idempotency_key:'smoke',instruction:'读取这个对象'}); console.log('prepare',p.status,p.json)
 if(p.status===200)console.log('execute',(await api(run.port,c.alice.cookie,'POST','/knowledge/v1/ai/execute',{prepared_id:p.json.data.prepared_id})).json)
} finally {await stopHost(host); console.log('runtime',run.root)}
