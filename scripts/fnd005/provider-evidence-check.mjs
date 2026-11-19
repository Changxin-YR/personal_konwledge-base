/** Local HTTP oracle for evidence accounting; no LLM, credentials or private data. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

for (const scenario of ['wrong-provider', 'preflight-rejected', 'write-did-not-change']) {
  let prepares = 0, objectCreates = 0
  const tool = () => prepares === 1 ? 'knowledgeos_read_object' : 'knowledgeos_update_object'
  const server = createServer((req,res) => {
    const object = { id: 'synthetic', revision: 1, body: 'synthetic GPT baseline' }
    let body, status = 200
    switch (req.url) {
      case '/knowledge/v1/auth/login': res.setHeader('set-cookie','test=fixture'); body = {}; break
      case '/knowledge/v1/ai/status': body = { model:'gpt-evidence-fixture', provider:scenario==='wrong-provider'?'other':'test-only', configured:true };break
      case '/knowledge/v1/objects': objectCreates++;status=201; body=object;break
      case '/knowledge/v1/ai/prepare': prepares++;if(scenario==='preflight-rejected')status=503;body={provider:'test-only',model:'gpt-evidence-fixture',tool:tool(),prepared_id:'fixture'};break
      case '/knowledge/v1/ai/execute':body={result:{code:prepares===1?'READ':'UPDATED',object}};break
      case '/knowledge/v1/objects/synthetic':body=object;break
      default: status=404
    }
    res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===503?{code:'CREDENTIALS_MISSING'}:{data:body}))
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  try {
    const out=await mkdtemp(join(tmpdir(),'ko-evidence-oracle-'))
    const child=spawn(process.execPath,['scripts/fnd005/real-provider-check.mjs','--port',String(server.address().port),'--expect-provider','test-only','--expect-model','gpt-evidence-fixture','--candidate','TEST_ONLY','--out',out],{stdio:'ignore',env:{...process.env,KO_FND005_LOGIN:'test',KO_FND005_PASSWORD:'synthetic'}})
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
    const report=JSON.parse(await readFile(join(out,'summary.json'),'utf8'))
    assert.equal(exit,1);assert.equal(report.status,'FAIL');assert(!report.operations.some(o=>o.tool==='knowledgeos_update_object'))
    if(scenario==='wrong-provider'){assert.equal(objectCreates,0);assert.equal(prepares,0)}
    if(scenario==='preflight-rejected'){assert.equal(report.provider_calls,0);assert.equal(report.failure_code,'CREDENTIALS_MISSING')}
    if(scenario==='write-did-not-change'){assert.equal(prepares,2);assert.equal(report.operations.length,1)}
    console.log(scenario,'PASS (local HTTP oracle, no real provider)')
  } finally {await new Promise(r=>server.close(r))}
}
