import { dryReply, quickSystem, stage } from './tokease/guard.mjs'
import { fixture } from './tokease/synthetic.mjs'

const selected=fixture.excerpts[0]
const outside='LEARN002_POSITIVE_CONTROL_OUTSIDE_SELECTION'

export async function run({assert,host,phaseName,origin,owner,outsider,p,step,pass,rows,headers,wire,request,upload,capture,chromeWrite}) {
  assert(['dry','live'].includes(phaseName))
  const api=p+'/practice-sessions',generate=api+'/generate',preview=generate+'/preview'
  const items=()=>rows('SELECT * FROM quick_practice_questions ORDER BY rowid')
  const pinned=await upload(owner,'bounded-quick-practice.md','先行段落。'+selected+outside+'。\n')
  const url='/knowledgeos/reader?'+new URLSearchParams({asset:pinned.id,version:pinned.version_id,unit:'1'})
  const page=owner.page
  await page.bringToFront()
  await page.goto(origin+url)
  const text=page.locator('#text')
  await text.filter({hasText:selected}).waitFor()
  const exact=await text.evaluate((element,value)=>{
    const node=element.firstChild,start=node.textContent.indexOf(value);
    if(start<0)throw Error('synthetic selection missing');
    const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+value.length);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
    return {start,end:start+value.length};
  }, selected)

  step('T01 launch the bounded paragraph from the actual Reader')
  await page.locator('#quick-paragraph').click()
  await page.locator('#quick-practice').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('quick'),'paragraph')
  await page.locator('#quick-count').fill('1')
  const checked=await chromeWrite(owner,preview,'#quick-preview',200)
  assert.equal(checked.data.available,true)
  assert.equal(checked.data.coverage.count,1)
  assert.deepEqual(checked.data.coverage.slices,[{ordinal:1,...exact}])
  await page.locator('#quick-coverage').filter({hasText:'第 1 单元'}).waitFor()
  await capture(page,'quick-paragraph-request-scope')
  await host.arm({stage,system:quickSystem,user:fixture,reply:dryReply})
  const created=await chromeWrite(owner,generate,'#quick-generate')
  assert.equal(created.data.status,'ready')
  assert.equal(created.data.replayed,false)
  assert(!JSON.stringify(created.data).includes(outside))
  const session=created.data.session
  assert.equal(items().length,1)
  const sessionPath=api+'/'+session.id+'/questions',attempt=api+'/'+session.id+'/attempts'
  const before=await request(owner,sessionPath)
  assert.equal(before.questions.length,1)
  const question=before.questions[0]
  assert.equal(question.kind,'choice')
  assert.equal(question.origin_kind,'generated')
  assert.equal(question.feedback,null)
  assert.deepEqual(question.attempts,[])
  assert.equal(question.evaluation_eligible,false)
  assert.equal((await wire(owner,p+'/questions/'+question.id+'/author')).status,404)
  assert.equal((await wire(outsider,sessionPath)).status,404)
  await page.locator('#practice-answer').waitFor()
  await page.locator('#practice-feedback').waitFor({state:'hidden'})
  await page.locator('#practice-answer').selectOption('1')
  const first=await chromeWrite(owner,attempt,'#practice-submit')
  assert.equal(first.data.attempt.sequence,1)
  assert.equal(first.data.attempt.independent,true)
  assert.equal(first.data.attempt.evaluation_eligible,false)
  const saved=rows('SELECT * FROM practice_attempts WHERE id=?',first.data.attempt.id)[0]
  assert.equal(saved.answer_json,'1')
  assert.equal(saved.submitted_at,first.data.attempt.submitted_at)
  assert.equal(first.data.feedback.evidence.version_id,pinned.version_id)
  const cited=await request(owner,p+'/citations/'+first.data.feedback.evidence.id+'/resolve')
  assert(selected.includes(cited.quote))
  await page.locator('#practice-feedback').waitFor()
  await capture(page,'quick-first-source-feedback')
  await page.locator('#practice-answer').selectOption(String(first.data.feedback.accepted_answer))
  const again=await chromeWrite(owner,attempt,'#practice-submit')
  assert.equal(again.data.attempt.sequence,2)
  assert.equal(again.data.attempt.grading_state,'correct')
  assert.equal(again.data.attempt.independent,false)
  assert.deepEqual(rows('SELECT * FROM practice_attempts WHERE id=?',first.data.attempt.id)[0],saved)
  const replay=await request(owner,generate,{method:'POST',headers:headers(owner,{'idempotency-key':created.key}),data:created.input})
  assert.equal(replay.session.id,session.id)
  assert.equal(replay.replayed,true)
  await page.locator('#quick-return-reader').click()
  await page.locator('#text mark').filter({hasText:selected}).waitFor()
  assert.equal(new URL(page.url()).searchParams.get('version'),pinned.version_id)
  await capture(page,'quick-return-to-original-selection')
  pass('T01',{generated:1,durable_first:true,appended_again:true,same_original_selection:true})

  step('T02 no egress for insufficient text and stale protected selection')
  const lowAsset=await upload(owner,'insufficient.txt','甲。\n','text/plain')
  const lowPage=await request(owner,p+'/assets/'+lowAsset.id+'/versions/'+lowAsset.version_id+'/reader?unit=1')
  const lowInput={scope:'paragraph',count:1,asset_id:lowAsset.id,version_id:lowAsset.version_id,ordinal:1,start:0,end:1,source_hash:lowPage.anchor}
  const low=await request(owner,preview,{method:'POST',headers:headers(owner),data:lowInput})
  assert.equal(low.available,false)
  const blocked=await request(owner,generate,{method:'POST',headers:headers(owner),data:{...lowInput,fingerprint:low.fingerprint}},201)
  assert.equal(blocked.status,'insufficient')
  assert.equal(blocked.session,undefined)
  assert.equal(items().length,1)
  const stale=await wire(owner,generate,{method:'POST',headers:headers(owner),data:{...created.input,fingerprint:'0'.repeat(64)}})
  assert.equal(stale.status,409)
  const invisible=await wire(outsider,preview,{method:'POST',headers:headers(outsider),data:lowInput})
  assert.equal(invisible.status,404)
  assert.equal(rows('SELECT count(*) n FROM practice_sessions')[0].n,1)
  pass('T02',{insufficient_zero_sessions:true,hidden_owner_answers:true,stale_preview_denied:true,generated_evaluation_eligible:false})
}
