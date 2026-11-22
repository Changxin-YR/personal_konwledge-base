// Frozen NOTE-002 acceptance through an isolated DSH Host, Chrome and SQLite.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,writeFileSync} from 'node:fs'
import {isAbsolute,join,relative,resolve,sep} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {api,dbPath,entryCookie} from '../fnd004/harness.mjs'
import {candidateFacts} from '../integrated-case-proof.mjs'
import {isolate} from '../lib002/a07-isolated-host.mjs'

const [candidate,entry,parent='.cache/note002-host']=process.argv.slice(2)
const root=fileURLToPath(new URL('../../',import.meta.url)),self='scripts/note002/host-outline.mjs'
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root})
const sha=value=>createHash('sha256').update(value).digest('hex')
assert.match(candidate??'',/^[a-f0-9]{40}$/,'expected full frozen candidate SHA')
assert.match(entry??'',/^[a-f0-9]{64}$/,'expected frozen entry SHA-256')
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate,'checkout must be the frozen candidate')
const runner_sha256=sha(readFileSync(join(root,self)))
assert.equal(runner_sha256,sha(git('show',candidate+':'+self)),'runner must match the frozen candidate')
const {tree,source_tree,entry_sha256,build_sha256}=candidateFacts(root,candidate)
assert.equal(entry_sha256,entry,'entry must match the frozen candidate')

const cache=resolve(root,'.cache'),output=resolve(root,parent)
const inside=(base,path)=>{const r=relative(base,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep)}
assert(inside(cache,output),'evidence must stay inside the repository .cache')
git('check-ignore','--',join(output,'run-placeholder','summary.json'))
mkdirSync(output,{recursive:true})
assert(inside(realpathSync(cache),realpathSync(output)),'evidence parent resolves outside .cache')
const out=mkdtempSync(join(output,'run-'))
const prefix='/knowledge/v1',marker={'x-knowledgeos-request':'1'},password=randomUUID()
const notes='/notes',pathFor=id=>notes+'/'+id
const rootLabel='\u6b63\u6587\uff08\u6839\u8282\u70b9\uff09'
const savedPrefix=/^\u5927\u7eb2\u5df2\u4fdd\u5b58/u,staleStatus=/\u5927\u7eb2\u4fee\u8ba2\u51b2\u7a81/u
const facts={candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256,
  scope:'NOTE-002 Host/Chrome/SQLite; v25 upgrade and affected regressions run separately',
  status:'NOT_RUN',T01:'NOT_RUN',T02:'NOT_RUN',A17:'NOT_RUN',checks:[],screens:[],boots:[]}
let host,browser,phase='bind and boot',activeTest

function pass(id,details){facts.checks.push({id,status:'PASS',details})}
async function capture(page,name){
  const bytes=await page.screenshot({path:join(out,name),fullPage:true,animations:'disabled'})
  facts.screens.push({name,sha256:sha(bytes)})
}
async function boot(){const running=await host.start();facts.boots.push(running.pid);return running}
async function http(ctx,path,method='GET',data,headers={}){
  return ctx.request.fetch(host.base+prefix+path,{method,data,maxRedirects:0,timeout:15000,headers:{...marker,...headers}})
}
async function ok(ctx,path,status,method='GET',data,headers){
  const r=await http(ctx,path,method,data,headers)
  assert.equal(r.status(),status,`${method} ${path}`)
  const envelope=await r.json();assert(Object.hasOwn(envelope,'data'),`${method} ${path} missing data`)
  return envelope.data
}
async function login(name){
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  // Local pages only; don't allow the acceptance browser to load an external service.
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===host.base?route.continue():route.abort())
  const page=await ctx.newPage();page.setDefaultTimeout(15000);await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password)
  await page.locator('#login').click();await page.locator('#profile').waitFor()
  return {ctx,page,user:(await ok(ctx,'/me',200)).id}
}
async function createNote(actor,title,body,citation){
  return ok(actor.ctx,notes,201,'POST',{actor_id:actor.user,title,body,kind:citation?'reading':'plain',
    ...(citation?{add_citation:citation}:{})},{'idempotency-key':randomUUID()})
}
const detail=(actor,id)=>ok(actor.ctx,pathFor(id),200)
async function sourceFixture(actor){
  const text='Synthetic fixed quotation. The original stays unchanged.'
  const doc=await ok(actor.ctx,'/imports',201,'POST',Buffer.from(text),{
    'content-type':'text/plain','idempotency-key':randomUUID(),'x-knowledgeos-filename':'outline-source.txt'})
  assert.equal(doc.sha256,sha(text))
  const original=`/assets/${doc.id}/versions/${doc.version_id}`
  await actor.page.goto(host.base+`/knowledgeos/reader?asset=${doc.id}&version=${doc.version_id}&unit=1`)
  const rendered=actor.page.locator('#text');await rendered.waitFor();assert.equal(await rendered.innerText(),text)
  await rendered.evaluate(el=>{
    const range=document.createRange();range.setStart(el.firstChild,0);range.setEnd(el.firstChild,25)
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range)
  })
  await actor.page.locator('#cite').click()
  const link=actor.page.getByRole('link',{name:'\u8bb0\u7b14\u8bb0'});await link.waitFor()
  const citation=new URL(await link.getAttribute('href'),host.base).searchParams.get('citation');assert(citation)
  return {citation,version:doc.version_id,original,text}
}

function dbRead(read){
  const db=new DatabaseSync(dbPath(host.data),{readOnly:true})
  try{db.exec('BEGIN');return read((q,...args)=>db.prepare(q).all(...args).map(r=>({...r})))}finally{db.close()}
}
const noteTables=['notes','note_nodes','note_references','note_outline_undo','project_note_refs']
function snapshot(){
  return dbRead(rows=>Object.fromEntries(noteTables.map(table=>[
    table,rows(`SELECT * FROM ${table}`).map(row=>JSON.stringify(row)).sort(),
  ])))
}
const dbNodes=id=>dbRead(rows=>rows('SELECT * FROM note_nodes WHERE note_id=? ORDER BY id',id))
const fixedRefs=id=>dbRead(rows=>rows(`SELECT r.id,r.node_id,r.citation_id,c.asset_id,c.version_id FROM note_references r
  JOIN note_nodes n ON n.id=r.node_id JOIN citations c ON c.id=r.citation_id WHERE n.note_id=? ORDER BY r.id`,id))
const undoRows=id=>dbRead(rows=>rows('SELECT revision,placements FROM note_outline_undo WHERE note_id=?',id))
const foreignKeys=()=>dbRead(rows=>rows('PRAGMA foreign_key_check'))
const unchanged=(snapshotBefore,label)=>assert.deepEqual(snapshot(),snapshotBefore,label+' changed persisted note state')

const nodeFields=({id,parent_id,order_key,body,body_revision})=>({id,parent_id,order_key,body,body_revision})
const byId=(a,b)=>a.id.localeCompare(b.id,'en')
function shape(nodes){
  const byParent=new Map(),byNode=new Map(nodes.map(n=>[n.id,n]))
  assert.equal(byNode.size,nodes.length,'duplicate node ID')
  for(const n of nodes){
    assert(Number.isSafeInteger(n.order_key),'missing or invalid order key')
    assert(Number.isSafeInteger(n.body_revision)&&n.body_revision>0,'invalid body revision')
    assert(n.parent_id===null||byNode.has(n.parent_id),'missing or cross-note parent')
    const siblings=byParent.get(n.parent_id)??[];siblings.push(n);byParent.set(n.parent_id,siblings)
  }
  const roots=byParent.get(null)??[];assert.equal(roots.length,1,'expected exactly one root')
  const ordered=[],visited=new Set()
  function visit(n,depth){
    assert(!visited.has(n.id),'cycle or duplicate traversal');visited.add(n.id);ordered.push({...n,depth})
    const siblings=byParent.get(n.id)??[]
    siblings.sort((a,b)=>a.order_key-b.order_key||byId(a,b))
    for(const child of siblings)visit(child,depth+1)
  }
  visit(roots[0],0);assert.equal(visited.size,nodes.length,'unreachable nodes or cycle')
  return {root:roots[0],ordered,children:id=>(byParent.get(id)??[]).map(n=>n.id)}
}
function nodeButton(page,id){
  assert.match(id,/^[a-f0-9-]{36}$/i)
  return page.locator(`#outline-list button[data-node-id="${id}"]`)
}
async function verify(actor,id,revision,{page=actor.page}={}){
  const n=await detail(actor,id)
  assert.equal(n.id,id);assert.equal(n.actor_id,actor.user);assert.equal(n.revision,revision)
  assert.equal(typeof n.outline?.can_undo,'boolean')
  const actual=n.outline.nodes.map(nodeFields).sort(byId)
  const stored=dbNodes(id).filter(row=>row.archived_at===null).map(nodeFields).sort(byId)
  assert.deepEqual(actual,stored,'HTTP outline does not match active SQLite rows')
  assert.equal(dbRead(rows=>rows('SELECT revision FROM notes WHERE id=?',id))[0].revision,revision)
  const undo=undoRows(id)
  if(n.outline.can_undo){
    assert.equal(undo.length,1);assert.equal(undo[0].revision,revision)
    assert(JSON.parse(undo[0].placements).length>0,'undo must persist prior placements')
  }else assert.deepEqual(undo,[],'an unavailable undo must not retain obsolete placements')
  const tree=shape(actual);assert.equal(n.body,tree.root.body,'legacy editor must use the same root body')
  if(page){
    const expected=tree.ordered.map(({id,parent_id,depth,body})=>({
      id,parent:parent_id??'',depth:String(depth),text:depth===0?rootLabel:body.trim(),
    }))
    await page.waitForFunction(expected=>{
      const actual=Array.from(document.querySelectorAll('#outline-list button[data-node-id]'),button=>{
        const li=button.closest('li');return {id:button.dataset.nodeId,parent:li?.dataset.parentId??'',
          depth:li?.dataset.depth,text:button.textContent.trim()}
      })
      return JSON.stringify(actual)===JSON.stringify(expected)
    },expected)
  }
  return {n,tree}
}
function expectChildren(tree,id,ids){assert.deepEqual(tree.children(id),ids,'wrong parent or sibling order at '+id)}
function expectMove(before,after,id,parent,index){
  const oldParent=before.ordered.find(n=>n.id===id).parent_id
  for(const n of before.ordered){
    const expected=before.children(n.id).slice()
    if(n.id===oldParent)expected.splice(expected.indexOf(id),1)
    if(n.id===parent)expected.splice(index,0,id)
    expectChildren(after,n.id,expected)
  }
}
function content(tree){return tree.ordered.map(({id,body,body_revision})=>({id,body,body_revision})).sort(byId)}
function layout(tree){return tree.ordered.map(({id,parent_id,depth})=>({id,parent_id,depth}))}
function archived(id,expected){
  const rows=dbNodes(id).filter(row=>row.archived_at!==null)
  assert.deepEqual(rows.map(r=>r.id).sort(),expected.map(n=>n.id).sort(),'wrong set of archived rows')
  for(const n of expected){
    const r=rows.find(r=>r.id===n.id)
    assert(r.archived_at,'soft deletion needs a persisted archive marker')
    assert.equal(r.body,n.body);assert.equal(r.body_revision,n.body_revision)
  }
}
function browserResponse(page,path,method,act){
  return Promise.all([page.waitForResponse(r=>r.url()===host.base+prefix+path&&r.request().method()===method),act()])
    .then(([response])=>response)
}
async function openNote(page,id){
  await page.bringToFront()
  await page.goto(host.base+'/knowledgeos/notes?note='+id);await page.locator('#outline-list button[data-node-id]').first().waitFor()
}
async function foreground(page){
  await page.bringToFront();await page.waitForFunction(()=>!document.hidden)
  await page.locator('#workspace').waitFor()
}
function watchWrites(page){
  const writes=[],base=host.base+prefix+notes
  const watch=req=>{
    if((req.url()===base||req.url().startsWith(base+'/'))&&!['GET','HEAD'].includes(req.method()))writes.push(req.method())
  }
  page.on('request',watch);return {writes,stop:()=>page.off('request',watch)}
}
async function uiChange(actor,id,revision,selector,action,{status=200}={}){
  const {page}=actor
  const response=await browserResponse(page,pathFor(id)+'/nodes','PATCH',()=>page.locator(selector).click())
  const sent=response.request().postDataJSON()
  assert.equal(sent.actor_id,actor.user);assert.equal(sent.expected_revision,revision)
  assert.equal(sent.action,action);assert.equal(response.status(),status,selector)
  if(status===200)await page.locator('#status').filter({hasText:savedPrefix}).waitFor()
  else assert.equal((await response.json()).code,'REVISION_CONFLICT')
  return sent
}
async function add(actor,id,revision,parent,body){
  await nodeButton(actor.page,parent).click();await actor.page.locator('#node-body').fill(body)
  const sent=await uiChange(actor,id,revision,'#node-add','add')
  assert.equal(sent.parent_id,parent);assert.equal(sent.body,body)
  const button=actor.page.locator('#outline-list').getByRole('button',{name:body,exact:true});await button.waitFor()
  const made=await button.getAttribute('data-node-id');assert(made&&made!==parent)
  const {tree}=await verify(actor,id,revision+1)
  assert.equal(await button.getAttribute('aria-current'),'true','add must select the new node')
  assert.equal(tree.children(parent).at(-1),made)
  const n=tree.ordered.find(n=>n.id===made);assert.equal(n.body,body);assert.equal(n.body_revision,1)
  return made
}
async function reject(actor,method,path,data,statuses,{code,redact=[]}={}){
  const before=snapshot(),r=await http(actor.ctx,path,method,data),body=await r.text()
  assert(statuses.includes(r.status()),`${method} ${path}: expected rejection, got HTTP ${r.status()}`)
  const error=JSON.parse(body);assert.equal(typeof error.code,'string','missing structured error code')
  if(code)assert.equal(error.code,code)
  assert(!Object.hasOwn(error,'data'),'rejection must not include a success payload')
  for(const secret of redact)assert(!body.includes(secret),'unauthorized response exposed private note data')
  unchanged(before,`${method} ${path} rejection`)
  return r.status()
}
async function movement(owner,src){
  const note=await createNote(owner,'NOTE-002 movement','Movement root body.',src.citation),id=note.id
  await openNote(owner.page,id)
  let rev=note.revision
  const {tree:initial,n:original}=await verify(owner,id,rev),r=initial.root.id
  assert.deepEqual(initial.ordered.map(n=>n.id),[r]);assert.equal(original.outline.can_undo,false)
  assert.equal(await nodeButton(owner.page,r).getAttribute('aria-current'),'true')
  const refs=fixedRefs(id);assert.equal(refs.length,1);assert.equal(refs[0].node_id,r)
  assert.equal(refs[0].citation_id,src.citation);assert.equal(refs[0].version_id,src.version)
  const originalLink=owner.page.locator('#references a').first();await originalLink.waitFor()
  const make=(parent,body)=>add(owner,id,rev++,parent,body)
  const a=await make(r,'Branch Alpha'),b=await make(r,'Branch Beta'),c=await make(r,'Branch Gamma')
  const a1=await make(a,'Alpha first child'),a2=await make(a,'Alpha second child')
  const leaf=await make(a1,'Alpha deeper descendant'),b1=await make(b,'Beta existing child')
  const {tree:baseline}=await verify(owner,id,rev)
  expectChildren(baseline,r,[a,b,c]);expectChildren(baseline,a,[a1,a2]);expectChildren(baseline,a1,[leaf]);expectChildren(baseline,b,[b1])
  assert.equal(baseline.ordered.find(n=>n.id===leaf).depth,3)

  let prior=baseline
  const shift=async(node,selector,parent,index)=>{
    await nodeButton(owner.page,node).click()
    const sent=await uiChange(owner,id,rev++,selector,'move')
    assert.deepEqual([sent.node_id,sent.parent_id,sent.index],[node,parent,index],'move must send the final zero-based slot')
    const {tree}=await verify(owner,id,rev);expectMove(prior,tree,node,parent,index)
    assert.deepEqual(content(tree),content(baseline),'structure changed text, IDs or body revisions')
    prior=tree
  }
  await shift(c,'#node-indent',b,1);await shift(c,'#node-promote',r,2)
  await shift(c,'#node-up',r,1);await shift(c,'#node-down',r,2)
  await nodeButton(owner.page,a1).click();await owner.page.locator('#node-target').selectOption(b)
  const move=await uiChange(owner,id,rev++,'#node-move','move')
  assert.deepEqual([move.node_id,move.parent_id,move.index],[a1,b,1])
  const moved=await verify(owner,id,rev);assert.equal(moved.n.outline.can_undo,true)
  expectMove(prior,moved.tree,a1,b,1)
  assert.deepEqual(content(moved.tree),content(baseline))
  await capture(owner.page,'t01-moved-branch.png')

  phase='T01 invalid moves and protected root'
  const other=await createNote(owner,'NOTE-002 target boundary','Other note root body.')
  const target=(await verify(owner,other.id,other.revision,{page:null})).tree.root.id
  const call=(action,extra)=>reject(owner,'PATCH',pathFor(id)+'/nodes',{
    actor_id:owner.user,expected_revision:rev,action,...extra,
  },[422],{code:'INVALID_OUTLINE_TARGET'})
  const rejections=[]
  for(const [node_id,parent_id,index] of [[a1,a1,0],[a1,leaf,0],[a1,target,0],[a1,b,-1],[a1,b,2],[r,a,0]]){
    rejections.push(await call('move',{node_id,parent_id,index}))
  }
  rejections.push(await reject(owner,'POST',pathFor(id)+'/delete-preview',{
    actor_id:owner.user,expected_revision:rev,node_id:r,
  },[422],{code:'INVALID_OUTLINE_TARGET'}))
  rejections.push(await call('delete',{node_id:r,mode:'subtree',preview_token:sha('not a root preview')}))
  assert.deepEqual(foreignKeys(),[])
  pass('T01_INVALID_MOVES_AND_ROOT_REJECTED',{http:rejections,unchanged:true,foreign_keys:true})

  phase='T01 undo and fixed references'
  await uiChange(owner,id,rev++,'#node-undo','undo')
  const undone=await verify(owner,id,rev)
  assert.deepEqual(layout(undone.tree),layout(baseline),'undo did not restore prior layout')
  assert.deepEqual(content(undone.tree),content(baseline));assert.deepEqual(fixedRefs(id),refs)
  assert.deepEqual(undone.n.references,original.references)
  pass('T01_CHROME_MOVES_AND_UNDO',{id,root_id:r,depth:3,node_ids:baseline.ordered.map(n=>n.id),revision:rev,
    sibling_order_restored:true,content_and_body_revisions_unchanged:true,fixed_references_unchanged:true})

  phase='T01 undo cannot overwrite a newer edit'
  prior=undone.tree;await shift(c,'#node-up',r,1)
  const undoRevision=rev,withUndo=await verify(owner,id,rev)
  assert.equal(withUndo.n.outline.can_undo,true)
  const edited='Gamma edited after structural change'
  await owner.page.locator('#node-body').fill(edited)
  const sent=await uiChange(owner,id,rev++,'#node-save','edit')
  assert.deepEqual([sent.node_id,sent.body],[c,edited])
  const postEdit=await verify(owner,id,rev)
  assert.deepEqual(layout(postEdit.tree),layout(withUndo.tree));assert.equal(postEdit.n.outline.can_undo,false)
  assert.deepEqual(content(postEdit.tree),content(withUndo.tree).map(n=>n.id===c?{...n,body:edited,body_revision:n.body_revision+1}:n))
  const undoRequest={actor_id:owner.user,action:'undo'}
  const stale=await reject(owner,'PATCH',pathFor(id)+'/nodes',{...undoRequest,expected_revision:undoRevision},[409],{code:'REVISION_CONFLICT'})
  const current=await reject(owner,'PATCH',pathFor(id)+'/nodes',{...undoRequest,expected_revision:rev},[409],{code:'OUTLINE_UNDO_UNAVAILABLE'})
  pass('T01_OBSOLETE_UNDO_REJECTED',{stale,current,edited_body_preserved:true})

  phase='T01 restart'
  const dbBefore=snapshot();await owner.ctx.close();await host.stop();await boot()
  assert.notEqual(facts.boots[0],facts.boots[1],'restart must boot another Host process')
  const restored=await login('owner');assert.equal(restored.user,owner.user)
  await openNote(restored.page,id)
  const after=await verify(restored,id,rev);unchanged(dbBefore,'restart')
  assert.deepEqual(after.n,postEdit.n);assert.deepEqual(fixedRefs(id),refs);assert.deepEqual(foreignKeys(),[])
  const link=new URL(await restored.page.locator('#references a').first().getAttribute('href'),host.base)
  assert.equal(link.searchParams.get('version'),src.version)
  const originalBytes=await http(restored.ctx,src.original+'/original');assert.equal(originalBytes.status(),200)
  assert.equal(sha(await originalBytes.body()),sha(src.text))
  await capture(restored.page,'t01-restored.png')
  pass('T01_RESTART_PRESERVES_IDS_TREE_AND_REFERENCE',{revision:rev,note_state_sha256:sha(JSON.stringify(dbBefore)),
    root_id:r,nodes:after.tree.ordered.length,source_version:src.version})
  return restored
}

async function previewInChrome(actor,id,revision,node,children,descendants){
  const {page}=actor
  await nodeButton(page,node).click();const before=snapshot()
  const path=pathFor(id)+'/delete-preview'
  const response=await browserResponse(page,path,'POST',()=>page.locator('#node-preview').click())
  assert.equal(response.status(),200)
  assert.deepEqual(response.request().postDataJSON(),{actor_id:actor.user,expected_revision:revision,node_id:node})
  const {data}=await response.json()
  assert.equal(data.actor_id,actor.user);assert.match(data.preview_token,/^[a-f0-9]{64}$/)
  assert.deepEqual(data.child_ids,children.map(n=>n.id));assert.deepEqual(data.descendant_ids,descendants.map(n=>n.id))
  const impact=page.locator('#node-impact');await impact.waitFor()
  assert.deepEqual(await impact.locator('li').allTextContents(),descendants.map(n=>
    (children.some(child=>child.id===n.id)?'\u76f4\u63a5\u5b50\u8282\u70b9\uff1a':'\u66f4\u6df1\u540e\u4ee3\uff1a')+n.body))
  unchanged(before,'delete preview');return data.preview_token
}

async function deletionAndConflict(owner,peer){
  phase='T02 tree and cancelled preview'
  const note=await createNote(owner,'Private deletion notebook','Private deletion root text.'),id=note.id
  const path=pathFor(id),nodesPath=path+'/nodes',previewPath=path+'/delete-preview'
  const page=owner.page;await openNote(page,id)
  let rev=note.revision
  const r=(await verify(owner,id,rev)).tree.root.id
  const make=(parent,body)=>add(owner,id,rev++,parent,body)
  const left=await make(r,'Keep left sibling'),p=await make(r,'Private parent to promote'),right=await make(r,'Keep right sibling')
  const s=await make(r,'Subtree parent to archive'),c1=await make(p,'Promoted first child'),c2=await make(p,'Promoted second child')
  const deep=await make(c1,'Grandchild survives promotion'),sc=await make(s,'Subtree direct descendant'),sd=await make(sc,'Subtree deeper descendant')
  const {tree:baseline}=await verify(owner,id,rev),get=id=>baseline.ordered.find(n=>n.id===id)
  expectChildren(baseline,r,[left,p,right,s]);expectChildren(baseline,p,[c1,c2]);expectChildren(baseline,c1,[deep])
  expectChildren(baseline,s,[sc]);expectChildren(baseline,sc,[sd]);archived(id,[])
  const promoteChildren=[get(c1),get(c2)],promoteDescendants=[get(c1),get(deep),get(c2)]
  const cancelToken=await previewInChrome(owner,id,rev,p,promoteChildren,promoteDescendants)
  await capture(page,'t02-promote-preview.png')
  const cancelBefore=snapshot(),cancelWatch=watchWrites(page)
  try{
    await page.locator('#node-delete-cancel').click();await page.locator('#node-impact').waitFor({state:'hidden'})
    await verify(owner,id,rev);unchanged(cancelBefore,'preview cancellation');assert.deepEqual(cancelWatch.writes,[])
  }finally{cancelWatch.stop()}
  const request=(action,more={})=>({actor_id:owner.user,expected_revision:rev,action,...more})
  const missing=await reject(owner,'PATCH',nodesPath,request('delete',{node_id:p,mode:'promote'}),[422],{code:'INVALID_NOTE'})
  const mismatch=await reject(owner,'PATCH',nodesPath,request('delete',{node_id:s,mode:'subtree',preview_token:cancelToken}),[409],{code:'OUTLINE_PREVIEW_REQUIRED'})
  pass('T02_PREVIEW_CANCEL_AND_TOKEN_BINDING',{direct_children:2,descendants:3,cancel_writes:0,missing,mismatch})

  phase='T02 delete-promote and undo'
  const remove=async(node,mode,token)=>{
    const sent=await uiChange(owner,id,rev++,'#node-delete-'+mode,'delete')
    assert.deepEqual([sent.node_id,sent.mode,sent.preview_token],[node,mode,token])
    await page.locator('#node-impact').waitFor({state:'hidden'})
    const state=await verify(owner,id,rev);assert.equal(state.n.outline.can_undo,true)
    return state.tree
  }
  const undo=async()=>{
    await uiChange(owner,id,rev++,'#node-undo','undo')
    const state=await verify(owner,id,rev);assert.equal(state.n.outline.can_undo,false)
    assert.deepEqual(layout(state.tree),layout(baseline));assert.deepEqual(content(state.tree),content(baseline));archived(id,[])
  }
  const promoteToken=await previewInChrome(owner,id,rev,p,promoteChildren,promoteDescendants)
  const promoted=await remove(p,'promote',promoteToken)
  expectChildren(promoted,r,[left,c1,c2,right,s]);expectChildren(promoted,c1,[deep]);expectChildren(promoted,s,[sc]);expectChildren(promoted,sc,[sd])
  assert.deepEqual(content(promoted),content(baseline).filter(n=>n.id!==p));archived(id,[get(p)])
  await undo()
  pass('T02_PROMOTE_DELETION',{archived:[p],child_order:[c1,c2],deeper_node_retained:deep,undo_restored:true})

  phase='T02 delete-subtree and undo'
  const subtreeToken=await previewInChrome(owner,id,rev,s,[get(sc)],[get(sc),get(sd)])
  await capture(page,'t02-subtree-preview.png')
  const subtracted=await remove(s,'subtree',subtreeToken)
  expectChildren(subtracted,r,[left,p,right]);expectChildren(subtracted,p,[c1,c2]);expectChildren(subtracted,c1,[deep])
  assert.deepEqual(content(subtracted),content(baseline).filter(n=>![s,sc,sd].includes(n.id)));archived(id,[get(s),get(sc),get(sd)])
  await undo()
  pass('T02_SUBTREE_SOFT_DELETION',{archived:[s,sc,sd],unrelated_branch_preserved:true,undo_restored:true})

  phase='T02 removed-node draft is not attached to its surviving parent'
  const childDraft='Uncommitted text for the removed child only.'
  await nodeButton(page,c1).click()
  await nodeButton(page,c1).and(page.locator('[aria-current="true"]')).waitFor()
  await page.locator('#node-body').fill(childDraft)
  const draftDelete=await previewInChrome(owner,id,rev,c1,[get(deep)],[get(deep)])
  const afterDraftDelete=await remove(c1,'promote',draftDelete)
  expectChildren(afterDraftDelete,p,[deep,c2]);archived(id,[get(c1)])
  await page.locator('#node-detached').waitFor()
  assert.equal(await page.locator('#node-body').inputValue(),childDraft)
  assert.equal(await page.locator('#node-body').getAttribute('readonly'),'')
  assert(await page.locator('#node-save').isDisabled())
  assert(await page.locator('#node-add').isDisabled())
  assert.equal(await nodeButton(page,p).getAttribute('aria-current'),'false')
  assert.equal(afterDraftDelete.ordered.find(n=>n.id===p).body,get(p).body)
  await capture(page,'t02-removed-node-draft.png')
  await undo()
  assert.equal(await nodeButton(page,c1).getAttribute('aria-current'),'true')
  assert.equal(await page.locator('#node-body').inputValue(),childDraft)
  assert.equal(await page.locator('#node-body').getAttribute('readonly'),null)
  page.once('dialog',dialog=>dialog.accept())
  await nodeButton(page,p).click()
  await nodeButton(page,p).and(page.locator('[aria-current="true"]')).waitFor()
  assert.equal(await page.locator('#node-body').inputValue(),get(p).body)
  pass('T02_REMOVED_NODE_DRAFT_CANNOT_OVERWRITE_PARENT',{detached_read_only:true,parent_unchanged:true,undo_reattached_to_original:true})

  phase='T02 other principal with real session'
  assert.notEqual(owner.user,peer.user)
  const peerNote=await createNote(peer,'Peer control note','Peer can use own outline.')
  await verify(peer,peerNote.id,peerNote.revision,{page:null})
  const privateFields=[note.title,note.body,get(p).body,p,c1,c2,deep]
  const privateResult={code:'NOTE_NOT_FOUND',redact:privateFields}
  const subject={actor_id:peer.user,expected_revision:rev}
  const ownPreviewBefore=snapshot()
  const ownPreview=await ok(owner.ctx,previewPath,200,'POST',{actor_id:owner.user,expected_revision:rev,node_id:p})
  assert.match(ownPreview.preview_token,/^[a-f0-9]{64}$/);unchanged(ownPreviewBefore,'owner preview before ACL checks')
  const auth=[]
  auth.push(await reject(peer,'GET',path,undefined,[404],privateResult))
  auth.push(await reject(peer,'POST',previewPath,{...subject,node_id:p},[404],privateResult))
  for(const operation of [
    {action:'add',parent_id:r,body:'Peer insertion attempt'},
    {action:'edit',node_id:p,body:'Peer overwrite attempt'},
    {action:'move',node_id:p,parent_id:right,index:0},
    {action:'delete',node_id:p,mode:'promote',preview_token:ownPreview.preview_token},
    {action:'undo'},
  ])auth.push(await reject(peer,'PATCH',nodesPath,{...subject,...operation},[404],privateResult))
  const forged=await reject(peer,'PATCH',nodesPath,{...subject,actor_id:owner.user,action:'edit',node_id:p,body:'Wrong account'},[409],{
    code:'ACTOR_CHANGED',redact:privateFields,
  })
  const forgedPreview=await reject(peer,'POST',previewPath,{...subject,actor_id:owner.user,node_id:p},[409],{
    code:'ACTOR_CHANGED',redact:privateFields,
  })
  pass('T02_PRIVATE_OUTLINE_ACL',{peer_has_own_note:true,peer_responses:auth,forged_actor:forged,
    forged_preview_actor:forgedPreview,no_disclosure_or_writes:true})

  phase='T02 two tabs: previous revision and persisted winning edit'
  const other={...owner,page:await owner.ctx.newPage()};other.page.setDefaultTimeout(15000)
  await openNote(other.page,id);await verify(other,id,rev)
  const staleRevision=rev
  const draft='The first tab keeps this unsaved draft.',server='The second tab saved this text first.'
  await foreground(page)
  await nodeButton(page,p).click();await page.locator('#node-body').fill(draft)
  await foreground(other.page)
  await nodeButton(other.page,p).click();await other.page.locator('#node-body').fill(server)
  const edited=await uiChange(other,id,rev++,'#node-save','edit');assert.deepEqual([edited.node_id,edited.body],[p,server])
  const winner=await verify(other,id,rev)
  assert.deepEqual(layout(winner.tree),layout(baseline))
  assert.deepEqual(content(winner.tree),content(baseline).map(n=>n.id===p?{...n,body:server,body_revision:n.body_revision+1}:n))
  const winnerDb=snapshot()
  const staleDelete={action:'delete',node_id:p,mode:'promote',preview_token:ownPreview.preview_token}
  const staleConfirm=await reject(owner,'PATCH',nodesPath,request('delete',{...staleDelete,expected_revision:staleRevision}),[409],{code:'REVISION_CONFLICT'})
  const oldToken=await reject(owner,'PATCH',nodesPath,request('delete',staleDelete),[409],{code:'OUTLINE_PREVIEW_REQUIRED'})
  const stalePreviewResponse=await reject(owner,'POST',previewPath,{actor_id:owner.user,expected_revision:staleRevision,node_id:p},[409],{code:'REVISION_CONFLICT'})

  phase='T02 stale move and explicit refresh without replay'
  const watch=watchWrites(page)
  try{
    await foreground(page);await page.locator('#node-target').selectOption(right)
    const moved=await uiChange(owner,id,staleRevision,'#node-move','move',{status:409})
    assert.deepEqual([moved.node_id,moved.parent_id,moved.index],[p,right,0])
    await page.locator('#node-conflict').waitFor();await page.locator('#status').filter({hasText:staleStatus}).waitFor()
    assert.equal(await page.locator('#node-latest').innerText(),server)
    assert.equal(await page.locator('#node-body').inputValue(),draft)
    unchanged(winnerDb,'stale browser move');assert.deepEqual(watch.writes,['PATCH'])
    await capture(page,'t02-conflict.png')

    const refreshed=await browserResponse(page,path,'GET',()=>page.locator('#node-refresh').click())
    assert.equal(refreshed.status(),200);await page.locator('#node-conflict').waitFor({state:'hidden'})
    await verify(owner,id,rev)
    assert.equal(await page.locator('#node-body').inputValue(),draft,'reading the server revision replaced the unsaved draft')
    assert.equal(await nodeButton(page,p).getAttribute('aria-current'),'true')
    await openNote(other.page,id);await verify(other,id,rev)
    await nodeButton(other.page,p).click()
    await nodeButton(other.page,p).and(other.page.locator('[aria-current="true"]')).waitFor()
    assert.equal(await other.page.locator('#node-body').inputValue(),server)
    await foreground(page);assert.equal(await page.locator('#node-body').inputValue(),draft)
    await capture(page,'t02-refreshed-draft.png')
    unchanged(winnerDb,'explicit refresh');assert.deepEqual(watch.writes,['PATCH'],'refresh replayed a mutation')
  }finally{watch.stop()}
  archived(id,[]);assert.deepEqual(foreignKeys(),[])
  pass('T02_STALE_DELETE_AND_TWO_TAB_MOVE',{stale_revision:staleRevision,winning_revision:rev,stale_confirm:staleConfirm,
    stale_token_using_head_revision:oldToken,stale_preview:stalePreviewResponse,stale_move:409,server_body_preserved:true,
    ui_draft_preserved:true,refresh_mutations:0,note_state_sha256:sha(JSON.stringify(winnerDb))})
}

function failure(kind,error){
  const line=String(error.stack).match(/host-outline\.mjs:\d+:\d+/)?.[0]
  const message=String(error.message).split(/\r?\n/,1)[0].replaceAll(password,'[redacted]')
  return {phase,kind,type:error.name,line,message}
}

try{
  host=await isolate(candidate,entry);facts.binding=host.facts
  const started=await boot(),cookie=await entryCookie(started.entry)
  assert.equal((await api(host.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})).status,201)
  assert.equal((await api(host.port,'','POST',prefix+'/auth/register',{login_name:'peer',display_name:'Peer',password})).status,201)
  const schema=dbRead(rows=>rows('PRAGMA user_version')[0].user_version)
  assert.equal(schema,26);facts.sqlite_schema=schema
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server',
  ]});facts.chrome=browser.version()
  activeTest='T01';phase='T01 initial browser, note and fixed citation'
  const owner=await login('owner'),src=await sourceFixture(owner)
  const restored=await movement(owner,src);facts.T01='PASS'
  activeTest='T02';phase='T02 independent peer login'
  const peer=await login('peer');await deletionAndConflict(restored,peer);facts.T02='PASS'
  activeTest=undefined;facts.status='PASS'
}catch(error){
  if(activeTest)facts[activeTest]='FAIL'
  facts.status='FAIL';facts.failure=failure('assertion_or_runtime',error)
}finally{
  phase='cleanup'
  for(const close of [()=>browser?.close(),()=>host?.stop()]){
    try{const result=await close();if(result)facts.last_host_exit=result}catch(error){
      facts.status='FAIL';(facts.cleanup_failures??=[]).push(failure('cleanup',error))
    }
  }
  facts.exit=facts.status==='PASS'?0:1
  const summary=join(out,'summary.json'),body=JSON.stringify(facts,null,2)+'\n'
  writeFileSync(summary,body,{flag:'wx'})
  console.log(`${facts.status} ${summary} sha256=${sha(body)}`)
  if(facts.failure)console.error(`${facts.failure.phase}: ${facts.failure.type}: ${facts.failure.message}`)
  process.exitCode=facts.exit
}
