import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Script } from 'node:vm'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { CODE_EXPLANATION_SYSTEM, codeQuestion, groundedExplanation, lineRange, sourceWindow } from '../../packages/knowledgeos-panel/src/domain/code-explanation.ts'
import { AiService } from '../../packages/knowledgeos-panel/src/host/ai-service.ts'
import { codeLocation, explainPinnedCode, readCodeCitation } from '../../packages/knowledgeos-panel/src/host/repository-explanation.ts'
import { buildRepositoryHtml } from '../../packages/knowledgeos-panel/src/host/repository-page.ts'
import { lib, seed } from '../fnd006/independent/common.mjs'

const code = 'other private line\r\n// threshold\r\n  return p > 3; // 🧪\r\nother private line\r\n'
const window = sourceWindow(code, lineRange(2, 3))
const fact = { start_line: 3, end_line: 3, quote: '  return p > 3; // 🧪' }
const answer = { facts: [fact], interpretations: [{text:'只有超过 3 才满足条件。', facts:[1]}], limits:['这两行无法确定调用者。'] }
const invalid = {code: 'MODEL_OUTPUT_INVALID'}

test('inclusive physical lines preserve indentation and UTF-16 content across supported EOLs', () => {
  for (const separator of ['\r\n','\n','\r']) {
    for (const suffix of ['',separator]) {
      const text = ['🧪','', '\t  x'].join(separator) + suffix
      assert.deepEqual(sourceWindow(text, lineRange(2,3)), {start_line:2,end_line:3,total_lines:3,lines:[{line:2,text:''},{line:3,text:'\t  x'}]})
      assert.throws(() => sourceWindow(text, lineRange(4,4)), {code:'CODE_RANGE_INVALID'})
    }
  }
})

test('range and question limits fail before inference, without silently clipping', () => {
  for (const [first,last] of [[1,0],[0,1],[1,1.5],['1',1],[2**53,2**53]]) assert.throws(() => lineRange(first,last), {code:'CODE_RANGE_INVALID'})
  assert.throws(() => lineRange(1,81), {code:'CODE_RANGE_TOO_LARGE'})
  assert.equal(lineRange(4,83).end_line,83)
  for (const text of [null,'']) assert.throws(() => sourceWindow(text, lineRange(1,1)), {code:'CODE_TEXT_REQUIRED'})
  assert.throws(() => sourceWindow('字'.repeat(4001), lineRange(1,1)), {code:'CODE_RANGE_TOO_LARGE'})
  for (const question of ['', '\t\n', 'A'.repeat(601), 'a\0b', '\ud800']) assert.throws(() => codeQuestion(question), {code:'CODE_QUESTION_INVALID'})
  assert.equal(codeQuestion('  边界如何？  '),'边界如何？')
})

test('only verified complete lines can be facts and interpretations reference known evidence', () => {
  const parse = x => groundedExplanation(JSON.stringify(x), window)
  assert.deepEqual(parse(answer),answer)
  const spanning = {start_line:2,end_line:3,quote:window.lines.map(x=>x.text).join('\n')}
  assert.deepEqual(parse({...answer,facts:[spanning]}).facts,[spanning])
  const insufficient = {facts:[],interpretations:[],limits:['需要调用处才能回答。']}
  assert.deepEqual(parse(insufficient),insufficient)
  for (const change of [{quote:'return p > 3; // 🧪'}, {quote:'  return p >= 3; // 🧪'}, {end_line:4}, {start_line:1}, {end_line:2}, {start_line:'3'}, {path:'another.ts'}]) {
    assert.throws(() => parse({...answer,facts:[{...fact,...change}]}),invalid)
  }
  for (const entries of [[],[1,1],[0],[2],['1']]) assert.throws(() => parse({...answer,interpretations:[{text:'推断',facts:entries}]}),invalid)
  for (const bad of [{...answer,facts:[fact,fact]}, {...answer,url:'external'}, {...answer,limits:[null]}, {facts:[],interpretations:[],limits:[]}, null]) assert.throws(() => parse(bad),invalid)
  assert.throws(()=>groundedExplanation('not json',window),invalid)
})

test('repository page script including citation restoration parses as browser JavaScript', () => {
  const html=buildRepositoryHtml('nonce')
  new Script(/<script nonce="nonce">([\s\S]*?)<\/script>/.exec(html)[1])
})

// Use the actual SQLite ACL and the actual AiService dispatch gates. Only the model transport is controlled.
async function prepared() {
  const dir=mkdtempSync(join(tmpdir(),'kos-code-explanation-'))
  const {actor}=await seed(lib,dir)
  const storage=new lib.ProbeStorage({dataDir:dir}), db=new DatabaseSync(join(dir,'knowledgeos.sqlite'))
  const sha='b'.repeat(40), bytes=Buffer.from(code), path='src/example.ts'
  const entry={path,sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),kind:'file',size:bytes.length}
  const revision={commit:sha,tree:'c'.repeat(40)}, controller=new AbortController()
  const {snapshot}=storage.repositories.saveSnapshot(actor,actor.userId,{id:10,owner:'synthetic',name:'sample',private:false},
    {kind:'tag',value:'v1'},'',revision,[entry],controller.signal,{entry,bytes})
  const location=codeLocation({path,commit:sha,blob_sha:entry.sha,start_line:2,end_line:3})
  let calls=0, before, delivered, current=actor
  const ai=new AiService({}, {provider:'fixture',model:'deepseek-controlled'}, {
    listProviders:()=>[{id:'fixture'}], listModels:async()=>{before?.();return [{id:'deepseek-controlled'}]},
    async *stream(options) {
      calls++
      assert.deepEqual(options.tools,[])
      assert.equal(options.system,CODE_EXPLANATION_SYSTEM)
      const packet=JSON.parse(options.messages[0].content[0].text)
      assert.deepEqual(packet,{path,question:'边界如何？',lines:window.lines})
      yield {type:'block-end',block:{type:'text',text:JSON.stringify(answer)}}
      delivered?.()
      yield {type:'finish',reason:{kind:'stop'}}
    }
  })
  return {actor,db,entry,snapshot,location,storage,controller,calls:()=>calls,
    before(fn){before=fn},delivered(fn){delivered=fn},setCurrent(a){current=a},
    ask:(loc=location,expected=actor.userId)=>explainPinnedCode(storage.repositories,ai,()=>current,expected,snapshot.id,loc,'边界如何？',controller.signal),
    close(){ai.close();db.close();storage.close()}}
}

test('source and citations are bound to one local version, and only selected lines reach the model', async()=>{
  const t=await prepared()
  try {
    const {source,facts}=await t.ask()
    assert.equal(source.snapshot_id,t.snapshot.id); assert.equal(source.total_lines,4); assert.deepEqual(facts,answer.facts)
    const result=readCodeCitation(t.storage.repositories,t.actor,t.snapshot.id,{...t.location,start_line:3,end_line:3})
    assert.deepEqual(result,{snapshot_id:t.snapshot.id,...t.location,...fact})
    for (const change of [{commit:'d'.repeat(40)}, {blob_sha:'e'.repeat(40)}]) await assert.rejects(t.ask({...t.location,...change}),{code:'CODE_SOURCE_CHANGED'})
    await assert.rejects(t.ask({...t.location,path:'other.ts'}),{code:'NOT_FOUND'})
    await assert.rejects(t.ask(t.location,randomUUID()),{code:'ACTOR_MISMATCH'})
    assert.equal(t.calls(),1)
  } finally {t.close()}
})
for (const stage of ['before','delivered']) test(`revoking source while ${stage === 'before' ? 'resolving the route' : 'waiting for the answer'} suppresses disclosure`, async()=>{
  const t=await prepared()
  try {
    t[stage](()=>t.db.prepare('DELETE FROM repository_files WHERE snapshot_id=?').run(t.snapshot.id))
    await assert.rejects(t.ask(),{code:'NOT_FOUND'})
    assert.equal(t.calls(),stage==='before'?0:1)
  } finally {t.close()}
})
test('local bytes changed outside the selected range invalidate both citation and dispatch', async()=>{
  const t=await prepared()
  try {
    t.db.prepare('UPDATE repository_files SET payload=? WHERE snapshot_id=?').run(Buffer.from(code.replace('other private line','changed first line')),t.snapshot.id)
    assert.throws(()=>readCodeCitation(t.storage.repositories,t.actor,t.snapshot.id,t.location),{code:'CODE_SOURCE_CHANGED'})
    await assert.rejects(t.ask(),{code:'CODE_SOURCE_CHANGED'})
    assert.equal(t.calls(),0)
  } finally {t.close()}
})
test('a changed session or cancellation after authorization cannot return the model answer', async()=>{
  const t=await prepared()
  try {
    t.before(()=>t.setCurrent({...t.actor,sessionId:randomUUID()}))
    await assert.rejects(t.ask(),{code:'AUTH_REQUIRED'}); assert.equal(t.calls(),0)
    t.setCurrent(t.actor); t.before(undefined); t.delivered(()=>t.controller.abort())
    await assert.rejects(t.ask(),{code:'CANCELLED'}); assert.equal(t.calls(),1)
  } finally {t.close()}
})
