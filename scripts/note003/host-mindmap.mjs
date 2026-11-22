// Frozen NOTE-003 and A17 browser observations, not a substitute for regression evidence.
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

const [candidate,entry,parent='.cache/note003-host']=process.argv.slice(2)
const root=fileURLToPath(new URL('../../',import.meta.url)),self='scripts/note003/host-mindmap.mjs'
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root})
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
assert.match(candidate??'',/^[a-f0-9]{40}$/,'expected full frozen candidate SHA')
assert.match(entry??'',/^[a-f0-9]{64}$/,'expected frozen entry SHA-256')
assert.equal(git('rev-parse','HEAD').toString().trim(),candidate,'checkout must be the frozen candidate')
const runner_sha256=hash(readFileSync(join(root,self)))
assert.equal(runner_sha256,hash(git('show',candidate+':'+self)),'runner must match the frozen candidate')
const {tree,source_tree,entry_sha256,build_sha256,ancestor}=candidateFacts(root,candidate)
assert.equal(entry_sha256,entry,'entry must match the frozen candidate')
const units=JSON.parse(git('show',candidate+':config/work_units.json').toString()).units
const participants=['NOTE-001','NOTE-002','NOTE-003'].map(unit_id=>{
  if(unit_id==='NOTE-003')return {unit_id,candidate_sha:candidate}
  const unit=units.find(unit=>unit.id===unit_id)
  assert.equal(unit?.status,'passed',`missing accepted ${unit_id}`)
  const candidate_sha=unit.candidate_commit??unit.accepted_base_commit
  ancestor(candidate_sha,unit_id)
  return {unit_id,candidate_sha}
})
const cache=resolve(root,'.cache'),output=resolve(root,parent)
function inside(base,path){const r=relative(base,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep)}
assert(inside(cache,output),'evidence must stay inside the repository .cache')
git('check-ignore','--',join(output,'run-placeholder','summary.json'))
mkdirSync(output,{recursive:true})
assert(inside(realpathSync(cache),realpathSync(output)),'evidence parent resolves outside .cache')
const out=mkdtempSync(join(output,'run-'))
const prefix='/knowledge/v1',notes='/notes',notePath=id=>notes+'/'+id
const marker={'x-knowledgeos-request':'1'},password=randomUUID()
const timeout=15000,refreshTimeout=8000
const viewSelector={outline:'#outline-list',map:'#mindmap'}
const facts={case_id:'A17',unit_id:'NOTE-003',candidate_sha:candidate,tree,source_tree,entry_sha256,build_sha256,runner_sha256,
  scope:'Host/Chrome/SQLite raw evidence; migration, affected regressions and integrated gate recorded separately',
  participants,status:'NOT_RUN',T01:'NOT_RUN',T02:'NOT_RUN',A17:'NOT_RUN',checks:[],screens:[],boots:[]}
let host,browser,phase='bind and boot',test,trace
const pass=(id,details)=>facts.checks.push({id,status:'PASS',details})

async function capture(page,name){
  const bytes=await page.screenshot({path:join(out,name),fullPage:true,animations:'disabled'})
  facts.screens.push({name,sha256:hash(bytes)})
}
async function boot(){const result=await host.start();facts.boots.push(result.pid);return result}
function http(actor,path,method='GET',data,headers={}){
  return actor.ctx.request.fetch(host.base+prefix+path,{method,data,maxRedirects:0,timeout,headers:{...marker,...headers}})
}
async function ok(actor,path,status,method='GET',data,headers){
  const r=await http(actor,path,method,data,headers)
  assert.equal(r.status(),status,`${method} ${path}`)
  const result=await r.json();assert(Object.hasOwn(result,'data'),`${method} ${path} missing data`)
  return result.data
}
async function login(name,viewport={width:1360,height:940}){
  const ctx=await browser.newContext({viewport,serviceWorkers:'block'})
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===host.base?route.continue():route.abort())
  const page=await newPage(ctx);await page.goto(host.base+'/knowledgeos/account')
  await page.locator('#login_name').fill(name);await page.locator('#login_password').fill(password)
  await page.locator('#login').click();await page.locator('#profile').waitFor()
  return {ctx,page,user:(await ok({ctx},'/me',200)).id}
}
async function newPage(ctx){const p=await ctx.newPage();p.setDefaultTimeout(timeout);return p}
const sourceText='Synthetic map quotation. The original stays at its fixed version.'
const quote=sourceText.slice(0,24),rootBody='Single authoritative note body',title='Private mind map integration fixture'
function importText(actor,text,previous){
  return ok(actor,'/imports',201,'POST',Buffer.from(text),{
    'content-type':'text/plain','idempotency-key':randomUUID(),'x-knowledgeos-filename':'mindmap-source.txt',
    ...(previous?{'x-knowledgeos-asset-id':previous.id,'x-knowledgeos-expected-version':String(previous.version)}:{}),
  })
}
async function fixture(owner){
  const {page}=owner,doc=await importText(owner,sourceText)
  assert.equal(doc.sha256,hash(sourceText));assert.equal(doc.version,1)
  await page.goto(host.base+`/knowledgeos/reader?asset=${doc.id}&version=${doc.version_id}&unit=1`)
  const text=page.locator('#text');await text.waitFor();assert.equal(await text.innerText(),sourceText)
  await text.evaluate((el,length)=>{
    const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,length)
    const selection=getSelection();selection.removeAllRanges();selection.addRange(r)
  },quote.length)
  await page.locator('#cite').click();const link=page.locator('#note-link');await link.waitFor()
  const citation=new URL(await link.getAttribute('href'),host.base).searchParams.get('citation');assert(citation)
  const n=await ok(owner,notes,201,'POST',{actor_id:owner.user,title,body:rootBody,kind:'reading',add_citation:citation},
    {'idempotency-key':randomUUID()})
  return {id:n.id,doc,citation,original:`/assets/${doc.id}/versions/${doc.version_id}/original`}
}

function dbRead(read){
  const db=new DatabaseSync(dbPath(host.data),{readOnly:true})
  try{db.exec('BEGIN');return read((q,...args)=>db.prepare(q).all(...args).map(r=>({...r})))}finally{db.close()}
}
function snapshot(id){
  return dbRead(rows=>({note:rows('SELECT * FROM notes WHERE id=?',id),
    nodes:rows('SELECT * FROM note_nodes WHERE note_id=? ORDER BY id',id),
    refs:rows(`SELECT r.*,c.asset_id,c.version_id FROM note_references r JOIN note_nodes n ON n.id=r.node_id
      JOIN citations c ON c.id=r.citation_id WHERE n.note_id=? ORDER BY r.id`,id),
    undo:rows('SELECT * FROM note_outline_undo WHERE note_id=?',id),
    layout:rows('SELECT direction,revision FROM note_map_layouts WHERE note_id=?',id),
  }))
}
const contentSnapshot=({layout,...content})=>content
const unchanged=(id,before,label)=>assert.deepEqual(snapshot(id),before,label+' changed SQLite state')
const byId=(a,b)=>a.id.localeCompare(b.id,'en')
const fields=({id,parent_id,order_key,body,body_revision})=>({id,parent_id,order_key,body,body_revision})
function shape(nodes){
  const index=new Map(nodes.map(n=>[n.id,n])),byParent=new Map(),seen=new Set(),ordered=[]
  assert.equal(index.size,nodes.length,'duplicate node ID')
  for(const n of nodes){
    assert(Number.isSafeInteger(n.order_key)&&Number.isSafeInteger(n.body_revision)&&n.body_revision>0)
    assert(n.parent_id===null||index.has(n.parent_id),'missing or cross-note parent')
    const siblings=byParent.get(n.parent_id)??[];siblings.push(n);byParent.set(n.parent_id,siblings)
  }
  for(const siblings of byParent.values())siblings.sort((a,b)=>a.order_key-b.order_key||byId(a,b))
  const siblings=id=>byParent.get(id)??[],roots=siblings(null);assert.equal(roots.length,1)
  function visit(n,depth){assert(!seen.has(n.id),'outline cycle');seen.add(n.id);ordered.push({...n,depth});for(const c of siblings(n.id))visit(c,depth+1)}
  visit(roots[0],0);assert.equal(seen.size,nodes.length,'unreachable node or cycle')
  return {root:roots[0],index,ordered,children:id=>siblings(id).map(n=>n.id)}
}
async function state(actor,id,revision){
  const n=await ok(actor,notePath(id),200),db=snapshot(id)
  assert.equal(n.id,id);assert.equal(n.actor_id,actor.user);assert.equal(db.note.length,1)
  assert.equal(n.revision,revision??db.note[0].revision);assert.equal(n.revision,db.note[0].revision)
  const nodes=n.outline.nodes.map(fields).sort(byId)
  assert.deepEqual(nodes,db.nodes.filter(n=>n.archived_at===null).map(fields).sort(byId),'HTTP tree does not match SQLite')
  assert.equal(n.outline.can_undo,db.undo.some(row=>row.revision===n.revision))
  const layout=n.layout;assert(['horizontal','vertical'].includes(layout.direction))
  assert(Number.isSafeInteger(layout.revision)&&layout.revision>=0)
  if(layout.revision===0){assert.equal(layout.direction,'horizontal');assert.deepEqual(db.layout,[])}
  else assert.deepEqual(db.layout,[{direction:layout.direction,revision:layout.revision}])
  const graph=shape(nodes);assert.equal(n.body,graph.root.body)
  return {n,db,graph}
}
const mapNodes='#mindmap button[data-node-id]',outlineNodes='#outline-list button[data-node-id]'
const button=(view,id)=>view.page.locator(`${view.mode==='map'?mapNodes:outlineNodes}[data-node-id="${id}"]`)
async function foreground(view){
  const {page}=view;await page.bringToFront();await page.waitForFunction(()=>!document.hidden)
  await page.locator('#workspace').waitFor();await page.locator(viewSelector[view.mode]).waitFor()
}
async function open(view,id){
  await view.page.bringToFront();await view.page.goto(host.base+'/knowledgeos/notes?'+new URLSearchParams({note:id,
    ...(view.mode==='map'?{view:'map'}:{})}))
  await view.page.locator(viewSelector[view.mode]).waitFor()
}
function watch(view,id){
  const {page}=view,paths=[];let navigations=0
  page.on('request',req=>{
    if(req.isNavigationRequest()&&req.resourceType()==='document'&&req.frame()===page.mainFrame())navigations++
    if(new URL(req.url()).origin===host.base&&new URL(req.url()).pathname.startsWith(prefix+notePath(id))&&req.method()!=='GET'){
      paths.push({method:req.method(),endpoint:new URL(req.url()).pathname.split('/').at(-1)})
    }
  })
  return {paths,nav:()=>navigations}
}
async function chromeState(view,expected){
  const {page,mode}=view
  const nodes=expected.graph.ordered.map(n=>({id:n.id,parent:n.parent_id??'',depth:String(n.depth),text:n.depth?n.body.trim():null}))
  if(mode==='map')nodes.sort(byId)
  await page.waitForFunction(({mode,nodes,mapNodes,outlineNodes})=>{
    const actual=[...document.querySelectorAll(mode==='map'?mapNodes:outlineNodes)].map(button=>{
      const data=(mode==='map'?button:button.closest('li'))?.dataset
      return {id:button.dataset.nodeId,parent:data?.parentId??'',depth:data?.depth,
        text:data?.depth==='0'?(button.textContent.trim()?null:''):button.textContent.trim()}
    })
    if(mode==='map')actual.sort((a,b)=>a.id.localeCompare(b.id,'en'))
    return JSON.stringify(actual)===JSON.stringify(nodes)
  },{mode,nodes,mapNodes,outlineNodes},{polling:50,timeout:refreshTimeout})
  assert.equal(await page.locator('#revision').textContent(),'\u4fee\u8ba2 '+expected.n.revision,'wrong note revision in '+mode)
  if(mode==='map'){
    assert.equal(await page.locator('#map-direction').inputValue(),expected.n.layout.direction)
    const childIds=await page.locator('#mindmap svg path[data-child-id]').evaluateAll(paths=>paths.map(path=>path.dataset.childId).sort())
    assert.deepEqual(childIds,nodes.filter(n=>n.parent).map(n=>n.id).sort(),'SVG must have one path per non-root node')
  }
}
async function select(view,graph,id){
  const n=graph.index.get(id);assert(n,'invalid fixture selection');await button(view,id).click()
  await view.page.waitForFunction(({selector,id,body})=>{
    const active=document.querySelector(`${selector}[data-node-id="${id}"]`)
    return ['aria-current','aria-pressed','aria-selected'].some(key=>active?.getAttribute(key)==='true')&&
      document.querySelector('#node-body')?.value===body
  },{selector:view.mode==='map'?mapNodes:outlineNodes,id,body:n.parent_id===null?'':n.body})
}
function response(view,path,method,perform){
  const hit=view.page.waitForResponse(r=>r.url()===host.base+prefix+path&&r.request().method()===method)
  return Promise.all([hit,perform()]).then(([r])=>r)
}
function expectedDetail(view,id,predicate){
  return view.page.waitForResponse(async r=>r.url()===host.base+prefix+notePath(id)&&r.request().method()==='GET'&&
    r.status()===200&&predicate((await r.json()).data),{timeout:refreshTimeout})
}
async function mutate(view,id,rev,selector,operation,status=200){
  const r=await response(view,notePath(id)+'/nodes','PATCH',()=>view.page.locator(selector).click())
  assert.equal(r.status(),status,operation.action+' '+view.mode)
  const sent=r.request().postDataJSON()
  assert.deepEqual(sent,{actor_id:view.user,expected_revision:rev,...operation})
  return r.json()
}
function sameTree(a,b){assert.deepEqual(a.graph.ordered,b.graph.ordered,'tree IDs, placements, bodies or body revisions differ')}
function children(s,id,expected){assert.deepEqual(s.graph.children(id),expected,'invalid sibling order at '+id)}
function sameRefs(a,b){assert.deepEqual(a.n.references,b.n.references);assert.deepEqual(a.db.refs,b.db.refs)}
async function reject(actor,id,path,method,data,status,code,sensitive=[]){
  const before=snapshot(id),r=await http(actor,path,method,data),raw=await r.text(),body=JSON.parse(raw)
  assert.equal(r.status(),status,`${method} ${path}`);assert.equal(typeof body.code,'string');if(code)assert.equal(body.code,code)
  assert(!Object.hasOwn(body,'data'));for(const value of sensitive)assert(!raw.includes(value),'private note data disclosed')
  unchanged(id,before,method+' '+path+' rejection');return body.code
}

async function observeSignal(view){
  // A second listener observes delivery without simulating or modifying the app's listener.
  await view.page.evaluate(()=>{
    const channel=new BroadcastChannel('knowledgeos-notes-change-v1')
    window.note003Signals={count:0,channel}
    channel.addEventListener('message',event=>{if(event.data==='changed')window.note003Signals.count++})
  })
}
const signalCount=view=>view.page.evaluate(()=>window.note003Signals.count)
function signalAfter(view,count){
  return view.page.waitForFunction(count=>window.note003Signals.count>count,count,{polling:50,timeout:refreshTimeout})
}
function eachContent(s){return s.graph.ordered.map(({id,body,body_revision})=>({id,body,body_revision})).sort(byId)}
function moved(before,after,node,parent,index){
  const old=before.graph.index.get(node).parent_id
  for(const n of before.graph.ordered){
    const expected=before.graph.children(n.id).filter(id=>n.id!==old||id!==node)
    if(n.id===parent)expected.splice(index,0,node)
    children(after,n.id,expected)
  }
  assert.deepEqual(eachContent(after),eachContent(before))
}
function edited(before,after,id,body){
  assert.deepEqual(after.graph.ordered,before.graph.ordered.map(n=>n.id===id?{...n,body,body_revision:n.body_revision+1}:n))
}
async function geometry(view,s){
  assert.equal(view.mode,'map');const vertical=s.n.layout.direction==='vertical'
  const data=await view.page.locator('#mindmap').evaluate(el=>{
    const nodes=[...el.querySelectorAll('button[data-node-id]')].map(button=>{
      const {left,top,right,bottom,width,height}=button.getBoundingClientRect()
      return {id:button.dataset.nodeId,left,top,right,bottom,width,height}
    })
    const edges=[...el.querySelectorAll('svg path[data-child-id]')].map(path=>{
      const length=path.getTotalLength(),matrix=path.getScreenCTM()
      const point=at=>{
        const p=path.getPointAtLength(at),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix)
        return {x:screen.x,y:screen.y}
      }
      const style=getComputedStyle(path)
      return {id:path.dataset.childId,length,start:point(0),end:point(length),drawn:style.stroke!=='none'&&style.visibility==='visible'}
    })
    return {nodes,edges}
  })
  const boxes=new Map(data.nodes.map(n=>[n.id,n])),edges=new Map(data.edges.map(edge=>[edge.id,edge]))
  assert.equal(boxes.size,s.graph.ordered.length);assert.equal(data.edges.length,boxes.size-1)
  const primary=b=>vertical?b.top+b.height/2:b.left+b.width/2
  const secondary=b=>vertical?b.left+b.width/2:b.top+b.height/2
  const within=(p,b)=>p.x>=b.left-2&&p.x<=b.right+2&&p.y>=b.top-2&&p.y<=b.bottom+2
  for(const n of s.graph.ordered){
    const box=boxes.get(n.id);assert(box?.width>0&&box.height>0,'map node has no visible geometry')
    const siblings=s.graph.children(n.id).map(id=>boxes.get(id))
    for(let i=1;i<siblings.length;i++)assert(secondary(siblings[i-1])<secondary(siblings[i]),'map sibling order differs from outline')
    if(n.parent_id===null)continue
    const parent=boxes.get(n.parent_id),edge=edges.get(n.id)
    assert(primary(box)>primary(parent),'child is not laid out along the selected axis')
    assert(edge?.drawn&&edge.length>0&&within(edge.start,parent)&&within(edge.end,box),'SVG edge does not join its actual parent and child')
  }
  return {axis:vertical?'y':'x',nodes:boxes.size,edges:data.edges.length}
}
async function navigation(view,id){
  const {page}=view
  const result=await page.evaluate(()=>{
    const nav=[...document.querySelectorAll('nav,[role="navigation"]')]
    const depth=(el,parent)=>{
      let n=0
      while(el){if(el.matches(parent))n++;el=el.parentElement}
      return n
    }
    const listDepth=[...document.querySelectorAll('nav ul,nav ol,[role="navigation"] ul,[role="navigation"] ol')]
      .map(el=>{let n=0;while(el&&!el.matches('nav,[role="navigation"]')){if(el.matches('ul,ol'))n++;el=el.parentElement}return n})
    const treeInsideNav=['#outline-list','#mindmap','#view-outline','#view-map']
      .some(selector=>!!document.querySelector(selector)?.closest('nav,[role="navigation"]'))
    return {navs:nav.length,maxDepth:Math.max(0,...listDepth,...nav.map(el=>depth(el,'nav,[role="navigation"]'))),treeInsideNav}
  })
  assert(result.navs>0&&result.maxDepth<=2&&!result.treeInsideNav,'note depth and view controls must not create third-level navigation')
  const before=view.watch.nav()
  const flip=async(mode,other)=>{
    await page.locator('#view-'+mode).click();await page.locator(viewSelector[mode]).waitFor()
    assert(await page.locator(viewSelector[other]).isHidden())
    assert.equal(await page.locator('#view-'+mode).getAttribute('aria-pressed'),'true')
    const url=new URL(page.url());assert.equal(url.searchParams.get('note'),id)
    assert.equal(url.searchParams.get('view'),mode==='map'?'map':null)
  }
  await flip('map','outline');await flip('outline','map');assert.equal(view.watch.nav(),before,'view toggle reloaded the document')
  return result
}
async function preview(view,id,rev,node,children,descendants){
  const saved=snapshot(id),r=await response(view,notePath(id)+'/delete-preview','POST',()=>view.page.locator('#node-preview').click())
  assert.equal(r.status(),200)
  assert.deepEqual(r.request().postDataJSON(),{actor_id:view.user,expected_revision:rev,node_id:node})
  const {data}=await r.json();assert.match(data.preview_token,/^[a-f0-9]{64}$/)
  assert.deepEqual(data.child_ids,children.map(n=>n.id));assert.deepEqual(data.descendant_ids,descendants.map(n=>n.id))
  const impact=view.page.locator('#node-impact');await impact.waitFor()
  assert.deepEqual(await impact.locator('li').allTextContents(),descendants.map(n=>
    (children.some(c=>c.id===n.id)?'\u76f4\u63a5\u5b50\u8282\u70b9\uff1a':'\u66f4\u6df1\u540e\u4ee3\uff1a')+n.body))
  unchanged(id,saved,'delete preview');return data.preview_token
}
async function fixedReference(view,src,baseline,{openReader=false}={}){
  const checked=await state(view,src.id);sameRefs(checked,baseline)
  assert.equal(checked.n.references.length,1)
  assert.equal(checked.n.references[0].citation_id,src.citation)
  assert.equal(checked.n.references[0].version_id,src.doc.version_id)
  const link=view.page.locator('#references a').first();await link.waitFor()
  const linkURL=new URL(await link.getAttribute('href'),host.base)
  assert.equal(linkURL.searchParams.get('version'),src.doc.version_id)
  assert.equal(linkURL.searchParams.get('citation'),src.citation)
  const resolved=await ok(view,'/citations/'+src.citation+'/resolve',200)
  assert.equal(resolved.version_id,src.doc.version_id);assert.equal(resolved.quote,quote)
  const r=await http(view,src.original);assert.equal(r.status(),200);assert.equal(hash(await r.body()),hash(sourceText))
  if(openReader){
    const [reader]=await Promise.all([view.page.waitForEvent('popup'),link.click()])
    try{const text=reader.locator('#text');await text.waitFor();assert.equal(await text.innerText(),sourceText)}finally{await reader.close()}
  }
}

// Arm all passive-tab observations before mutating. Do not foreground or reload the recipient.
async function paired(writer,reader,id,revision,selector,op){
  const observed=await signalCount(reader),readerNav=reader.watch.nav(),writerNav=writer.watch.nav()
  const [result]=await Promise.all([
    mutate(writer,id,revision,selector,op),expectedDetail(reader,id,d=>d.revision===revision+1),signalAfter(reader,observed),
  ])
  const after=await state(writer,id,revision+1);assert.equal(result.data.revision,after.n.revision)
  await chromeState(writer,after);await chromeState(reader,after)
  assert.equal(reader.watch.nav(),readerNav,'sync reloaded the receiving tab');assert.equal(writer.watch.nav(),writerNav)
  trace.push({operation:op.action,from:writer.mode,to:reader.mode,revision:after.n.revision,signal:true,detail_refetched:true,reload:false})
  return after
}
async function add(writer,reader,id,before,parent,body){
  await foreground(writer);await select(writer,before.graph,parent);await writer.page.locator('#node-body').fill(body)
  const after=await paired(writer,reader,id,before.n.revision,'#node-add',{action:'add',parent_id:parent,body})
  const added=after.graph.ordered.filter(n=>!before.graph.index.has(n.id))
  assert.equal(added.length,1);assert.equal(added[0].body_revision,1);assert.equal(added[0].body,body)
  children(after,parent,[...before.graph.children(parent),added[0].id])
  for(const n of before.graph.ordered)assert.deepEqual(after.graph.index.get(n.id),before.graph.index.get(n.id),'add modified an existing node')
  return {after,made:added[0].id}
}

async function twoViews(outline,map,src,initial){
  const id=src.id,path=notePath(id),r=initial.graph.root.id;let current=initial
  const make=async(writer,reader,parent,body)=>{
    const {after,made}=await add(writer,reader,id,current,parent,body);current=after;return made
  }
  phase='T01 outline grows a deep tree; clean map receives each change'
  const a=await make(outline,map,r,'Outline branch alpha'),b=await make(outline,map,r,'Outline branch beta')
  const c1=await make(outline,map,a,'Outline nested child'),c2=await make(outline,map,a,'Outline sibling child')
  const deep=await make(outline,map,c1,'Outline third-depth node')
  assert.equal(current.graph.ordered.find(n=>n.id===deep).depth,3)
  await foreground(outline)
  const nav=await navigation(outline,id);await chromeState(outline,current)
  pass('A17_DEEP_CONTENT_WITH_TWO_LEVEL_NAVIGATION',{max_note_depth:3,notes_navigation:nav})

  phase='T01 map adds, edits and moves; outline edits the same map node'
  const fromMap=await make(map,outline,b,'Map-created branch')
  await select(map,current.graph,fromMap);await map.page.locator('#node-body').fill('Map-authored revision')
  let next=await paired(map,outline,id,current.n.revision,'#node-save',{action:'edit',node_id:fromMap,body:'Map-authored revision'})
  edited(current,next,fromMap,'Map-authored revision');current=next
  await select(map,current.graph,c1);await map.page.locator('#node-target').selectOption(b)
  next=await paired(map,outline,id,current.n.revision,'#node-move',{action:'move',node_id:c1,parent_id:b,index:1})
  moved(current,next,c1,b,1);current=next;children(current,c1,[deep]);children(current,a,[c2]);children(current,b,[fromMap,c1])
  await foreground(outline);await select(outline,current.graph,fromMap);await outline.page.locator('#node-body').fill('Outline revised the map node')
  next=await paired(outline,map,id,current.n.revision,'#node-save',{action:'edit',node_id:fromMap,body:'Outline revised the map node'})
  edited(current,next,fromMap,'Outline revised the map node');current=next
  await capture(outline.page,'t01-outline-synced.png');await foreground(map);await capture(map.page,'t01-map-synced.png')
  pass('A17_BIDIRECTIONAL_SHARED_TREE',{operations:trace.slice(),node_ids:current.graph.ordered.map(n=>n.id),absolute_depth:3,
    sql_rows:current.db.nodes.length,cloned_nodes:0})

  phase='T01 map previews deletion and cancellation; outline undoes both modes'
  const baseline=current,subtree=baseline.graph.ordered.filter(n=>[fromMap,c1,deep].includes(n.id))
  const direct=subtree.filter(n=>n.parent_id===b),watch=map.watch.paths
  await select(map,current.graph,b)
  await preview(map,id,current.n.revision,b,direct,subtree);await capture(map.page,'t01-map-delete-preview.png')
  const beforeCancel=snapshot(id),cancelCount=watch.length
  await map.page.locator('#node-delete-cancel').click();await map.page.locator('#node-impact').waitFor({state:'hidden'})
  unchanged(id,beforeCancel,'preview cancellation');assert.equal(watch.length,cancelCount,'cancel issued a write')
  const restored=[]
  for(const mode of ['promote','subtree']){
    await foreground(map);await select(map,current.graph,b)
    const token=await preview(map,id,current.n.revision,b,direct,subtree)
    const removed=await paired(map,outline,id,current.n.revision,'#node-delete-'+mode,
      {action:'delete',node_id:b,mode,preview_token:token})
    const removedIds=mode==='promote'?[b]:[b,...subtree.map(n=>n.id)]
    assert.deepEqual(removed.db.nodes.filter(n=>n.archived_at!==null).map(n=>n.id).sort(),removedIds.slice().sort())
    assert.deepEqual(eachContent(removed),eachContent(baseline).filter(n=>!removedIds.includes(n.id)))
    children(removed,r,mode==='promote'?[a,fromMap,c1]:[a]);children(removed,a,[c2])
    if(mode==='promote')children(removed,c1,[deep])
    sameRefs(removed,initial)
    await foreground(outline)
    current=await paired(outline,map,id,removed.n.revision,'#node-undo',{action:'undo'})
    sameTree(baseline,current);sameRefs(current,initial);assert.deepEqual(current.db.nodes,baseline.db.nodes)
    restored.push({mode,archived_ids:removedIds,restored_revision:current.n.revision})
  }
  pass('A17_MAP_PREVIEW_DELETE_OUTLINE_UNDO',{direct_child_ids:direct.map(n=>n.id),descendant_ids:subtree.map(n=>n.id),
    cancel_writes:0,modes:restored,verified_live_operations:trace.slice(-4)})
  return {current,fromMap,b,deep}
}

async function conflict(outline,map,src,{current,fromMap,b}){
  phase='T01 dirty outline does not adopt winning map edit'
  const id=src.id,path=notePath(id),rev=current.n.revision
  const draft='Outline draft that must never be replayed',winner='Map commit that must remain authoritative'
  await foreground(outline);await select(outline,current.graph,fromMap)
  await outline.page.locator('#node-body').fill(draft)
  const bPreview=await ok(outline,path+'/delete-preview',200,'POST',{actor_id:outline.user,expected_revision:rev,node_id:b})
  await foreground(map);await select(map,current.graph,fromMap);await map.page.locator('#node-body').fill(winner)
  const signal=await signalCount(outline),beforeNav=outline.watch.nav(),beforeWrites=outline.watch.paths.length
  await Promise.all([
    mutate(map,id,rev,'#node-save',{action:'edit',node_id:fromMap,body:winner}),
    expectedDetail(outline,id,data=>data.revision===rev+1),signalAfter(outline,signal),
  ])
  const after=await state(map,id,rev+1);edited(current,after,fromMap,winner);await chromeState(map,after)
  // The old revision and old committed label remain in the dirty tab after the signal/refetch.
  await chromeState(outline,current)
  assert.equal(await outline.page.locator('#node-body').inputValue(),draft)
  assert.equal(outline.watch.paths.length,beforeWrites,'signal silently replayed a mutation')

  phase='T01 stale intent rejected; explicit refresh keeps both texts'
  const deletion={actor_id:outline.user,action:'delete',node_id:b,mode:'subtree',preview_token:bPreview.preview_token}
  const staleDelete=await reject(outline,id,path+'/nodes','PATCH',{...deletion,expected_revision:rev},409,'REVISION_CONFLICT')
  const staleToken=await reject(outline,id,path+'/nodes','PATCH',{...deletion,expected_revision:rev+1},409,'OUTLINE_PREVIEW_REQUIRED')
  const staleSave=await reject(outline,id,path+'/nodes','PATCH',{actor_id:outline.user,expected_revision:rev,action:'edit',node_id:fromMap,body:draft},409,'REVISION_CONFLICT')
  await foreground(outline);await outline.page.locator('#node-target').selectOption(current.graph.root.id)
  const move={action:'move',node_id:fromMap,parent_id:current.graph.root.id,index:current.graph.children(current.graph.root.id).length}
  const answer=await mutate(outline,id,rev,'#node-move',move,409)
  assert.equal(answer.code,'REVISION_CONFLICT');await outline.page.locator('#node-conflict').waitFor()
  await outline.page.locator('#status').filter({hasText:/\u5927\u7eb2\u4fee\u8ba2\u51b2\u7a81/u}).waitFor()
  assert.equal(await outline.page.locator('#node-latest').innerText(),winner)
  assert.equal(await outline.page.locator('#node-body').inputValue(),draft)
  unchanged(id,after.db,'stale move');await capture(outline.page,'t01-cross-view-conflict.png')
  const refreshed=await response(outline,path,'GET',()=>outline.page.locator('#node-refresh').click())
  assert.equal(refreshed.status(),200);await outline.page.locator('#node-conflict').waitFor({state:'hidden'})
  await chromeState(outline,after)
  assert.equal(await outline.page.locator('#node-body').inputValue(),draft)
  assert.equal(await button(outline,fromMap).getAttribute('aria-current'),'true')
  await foreground(map);await select(map,after.graph,fromMap)
  assert.equal(await map.page.locator('#node-body').inputValue(),winner)
  await foreground(outline);assert.equal(await outline.page.locator('#node-body').inputValue(),draft)
  unchanged(id,after.db,'manual conflict refresh')
  assert.deepEqual(outline.watch.paths.slice(beforeWrites),[{method:'PATCH',endpoint:'nodes'}],'more than the stale move was sent')
  assert.equal(outline.watch.nav(),beforeNav)
  await capture(outline.page,'t01-refresh-retains-draft.png')
  pass('A17_STALE_DRAFT_PRESERVED_WITHOUT_REPLAY',{base_revision:rev,winning_revision:rev+1,stale_move:answer.code,
    stale_save:staleSave,stale_delete:staleDelete,old_preview_at_head:staleToken,local_draft_preserved:true,
    winning_body_preserved:true,refresh_mutations:0,sqlite_state_sha256:hash(JSON.stringify(after.db))})
  // Explicitly discard the synthetic conflict draft before starting the clean layout scenario.
  await open(outline,id);await observeSignal(outline);await chromeState(outline,after)
  return after
}

async function privatePeer(owner,src,baseline){
  phase='T01 private note and layout unavailable to peer'
  const id=src.id,path=notePath(id),peer=await login('peer'),{page}=peer
  try{
    assert.notEqual(peer.user,owner.user)
    const hidden=[title,rootBody,src.citation,src.doc.version_id]
    const ownerState=await state(owner,id),actor_id=peer.user,expected_revision=ownerState.n.revision
    const target=ownerState.graph.ordered.find(n=>n.parent_id&&ownerState.graph.children(n.id).length).id
    const statuses=[]
    const deny=async(url,method,data)=>statuses.push(await reject(peer,id,url,method,data,404,'NOTE_NOT_FOUND',hidden))
    await deny(path,'GET')
    await deny(path+'/nodes','PATCH',{actor_id,expected_revision,action:'edit',node_id:target,body:'Peer may not write this'})
    await deny(path+'/delete-preview','POST',{actor_id,expected_revision,node_id:target})
    await deny(path+'/layout','PATCH',{actor_id,expected_revision:ownerState.n.layout.revision,direction:'vertical'})
    await reject(peer,id,path+'/nodes','PATCH',{actor_id:owner.user,expected_revision,action:'undo'},409,'ACTOR_CHANGED',hidden)
    const [r]=await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url()===host.base+prefix+path),
      page.goto(host.base+'/knowledgeos/notes?'+new URLSearchParams({note:id,view:'map'}))])
    assert.equal(r.status(),404)
    await page.locator('#status').filter({hasText:/\u7b14\u8bb0\u6216\u5173\u8054\u4e0d\u53ef\u7528/u}).waitFor()
    assert.equal(await page.locator(mapNodes).count(),0)
    const rendered=await page.locator('main').textContent();for(const value of hidden)assert(!rendered.includes(value))
    assert.equal((await http(peer,src.original)).status(),404)
    assert.deepEqual(snapshot(id),baseline.db)
    pass('A17_PRIVATE_PEER_DENIED',{errors:statuses,browser_map:404,original:404,forged_actor:409,sqlite_unchanged:true})
  }finally{await peer.ctx.close()}
}

async function changeDirection(map,outline,id,before,direction){
  await foreground(map)
  const rev=before.n.layout.revision+1,count=await signalCount(outline),nav=outline.watch.nav()
  const [r]=await Promise.all([
    response(map,notePath(id)+'/layout','PATCH',()=>map.page.locator('#map-direction').selectOption(direction)),
    expectedDetail(outline,id,data=>data.layout.revision===rev&&data.layout.direction===direction),signalAfter(outline,count),
  ])
  assert.equal(r.status(),200)
  assert.deepEqual(r.request().postDataJSON(),{actor_id:map.user,expected_revision:before.n.layout.revision,direction})
  const {data}=await r.json();assert.deepEqual(data.layout,{direction,revision:rev})
  await map.page.locator('#map-layout-status').filter({hasText:/^\u5e03\u5c40\u5df2\u4fdd\u5b58/u}).waitFor()
  const after=await state(map,id,before.n.revision)
  assert.deepEqual(after.n.layout,{direction,revision:rev})
  assert.deepEqual(contentSnapshot(after.db),contentSnapshot(before.db),'layout write touched the note, nodes, undo or citations')
  assert.deepEqual(after.n.outline,before.n.outline);sameRefs(after,before)
  await chromeState(map,after);await chromeState(outline,after);assert.equal(outline.watch.nav(),nav)
  return after
}
async function layoutAndRestart(outline,map,src,initial,before,deep){
  const id=src.id,path=notePath(id)
  phase='T02 vertical layout only advances layout revision; SVG joins actual node boxes'
  await foreground(map);const horizontal=await geometry(map,before)
  assert.deepEqual(before.n.layout,{direction:'horizontal',revision:0})
  const newBody='Outline draft saved using only the content revision'
  await foreground(outline);await select(outline,before.graph,deep)
  await outline.page.locator('#node-body').fill(newBody)
  const vertical=await changeDirection(map,outline,id,before,'vertical'),verticalGeometry=await geometry(map,vertical)
  await capture(map.page,'t02-vertical-desktop.png')
  const staleLayout=await reject(map,id,path+'/layout','PATCH',{actor_id:map.user,expected_revision:0,direction:'horizontal'},409,'LAYOUT_CONFLICT')
  assert.equal(await outline.page.locator('#node-body').inputValue(),newBody)
  await button(map,deep).focus()
  await map.page.waitForFunction(id=>document.activeElement?.dataset.nodeId===id,deep)
  await foreground(outline)
  const content=await paired(outline,map,id,before.n.revision,'#node-save',{action:'edit',node_id:deep,body:newBody})
  edited(before,content,deep,newBody);assert.deepEqual(content.n.layout,vertical.n.layout)
  assert.deepEqual(content.db.layout,vertical.db.layout)
  await foreground(map)
  await map.page.waitForFunction(id=>document.activeElement?.dataset.nodeId===id,deep)
  pass('MAP_FOCUS_RESTORED_AFTER_SYNC',{node_id:deep,real_two_tabs:true})
  const turnedBack=await changeDirection(map,outline,id,content,'horizontal'),horizontalGeometry=await geometry(map,turnedBack)
  assert.deepEqual(horizontalGeometry,horizontal);await capture(map.page,'t02-horizontal-desktop.png')
  const persisted=await changeDirection(map,outline,id,turnedBack,'vertical')
  assert.deepEqual(await geometry(map,persisted),verticalGeometry)
  pass('A17_LAYOUT_AND_CONTENT_REVISIONS_ISOLATED',{initial:before.n.layout,vertical:vertical.n.layout,horizontal:turnedBack.n.layout,
    persisted_layout:persisted.n.layout,
    initial_content_revision:before.n.revision,final_content_revision:persisted.n.revision,stale_layout:staleLayout,
    draft_retained_through_layout_change:true,vertical_geometry:verticalGeometry,horizontal_geometry:horizontalGeometry})

  phase='T02 map refresh and new Chrome context after Host restart'
  await map.page.reload();await map.page.locator('#mindmap').waitFor();await chromeState(map,persisted)
  assert.deepEqual(await geometry(map,persisted),verticalGeometry)
  unchanged(id,persisted.db,'Chrome reload')
  await map.ctx.close();await host.stop();await boot()
  assert.notEqual(facts.boots[0],facts.boots[1],'expected a real Host restart')
  const mobile={...await login('owner',{width:390,height:844}),mode:'map'}
  assert.equal(mobile.user,map.user);await open(mobile,id)
  const verified=await state(mobile,id,persisted.n.revision)
  sameTree(persisted,verified);assert.deepEqual(verified.n.layout,persisted.n.layout);unchanged(id,persisted.db,'restart')
  await chromeState(mobile,verified);await foreground(mobile)
  assert.deepEqual(await geometry(mobile,verified),verticalGeometry)
  const viewport=await mobile.page.locator('#mindmap').evaluate(el=>({
    pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,mapWidth:el.clientWidth,drawingWidth:el.scrollWidth,
  }))
  assert(viewport.pageWidth<=viewport.viewport+1,'map expands the mobile document instead of scrolling locally')
  assert(viewport.drawingWidth>viewport.mapWidth,'the deep tree should require local map scrolling on mobile')
  await mobile.page.locator('#mindmap').hover();await mobile.page.mouse.wheel(510,0)
  await mobile.page.waitForFunction(()=>document.querySelector('#mindmap').scrollLeft>0)
  const scrollLeft=await mobile.page.locator('#mindmap').evaluate(el=>el.scrollLeft)
  await select(mobile,verified.graph,deep)
  await mobile.page.locator('#node-body').fill('Mobile control is editable, but this draft will not be sent')
  assert.equal(await mobile.page.locator('#node-save').isEnabled(),true)
  await mobile.page.locator('#node-body').fill(newBody)
  assert.equal(await mobile.page.locator('#node-save').isDisabled(),true)
  await capture(mobile.page,'t02-restored-mobile.png')
  await fixedReference(mobile,src,initial,{openReader:true});unchanged(id,persisted.db,'restored mobile and source inspection')
  assert.deepEqual(dbRead(rows=>rows('PRAGMA foreign_key_check')),[])
  pass('A17_RESTART_PRESERVES_LAYOUT_TREE_AND_FIXED_SOURCE',{layout:persisted.n.layout,revision:persisted.n.revision,
    same_node_ids:persisted.graph.ordered.map(n=>n.id),source_version:src.doc.version_id,original_sha256:hash(sourceText),
    viewport,scroll_left:scrollLeft,mobile_edit_control_operable:true,sqlite_sha256:hash(JSON.stringify(persisted.db))})
}

async function returnDuringRead(map,id){
  phase='foreground visibility handler drains an in-flight note read'
  const pattern=host.base+prefix+notePath(id),started=Promise.withResolvers(),release=Promise.withResolvers(),finished=Promise.withResolvers()
  let intercepting=false,routeError,timer
  const pause=async route=>{
    intercepting=true
    try{
      const response=await route.fetch({timeout})
      assert.equal(response.status(),200);started.resolve();await release.promise;await route.fulfill({response})
    }catch(error){routeError=error;started.resolve()}
    finally{finished.resolve()}
  }
  await foreground(map)
  await map.page.route(pattern,pause,{times:1})
  try{
    await map.page.locator('#list button[aria-current="true"]').click()
    await Promise.race([started.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('note read did not reach the gate')),timeout)})])
    assert.ifError(routeError)
    // Chrome headless versions differ in whether bringToFront changes Page Visibility.
    // This targeted check drives the handler with synthetic state; A17 uses both live tabs separately.
    await map.page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))
      delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))
    })
    assert(await map.page.locator('#workspace').isHidden(),'unverified workspace must remain hidden while the original read is pending')
    release.resolve();await finished.promise;assert.ifError(routeError)
    await map.page.locator('#workspace').waitFor({timeout:3000})
    await map.page.locator('#mindmap').waitFor({timeout:3000})
    pass('MAP_FOREGROUND_REFRESH_DRAINS_BUSY_ACTION',{injected_visibility_event:true,real_paused_http_read:true,verified_workspace_restored:true})
  }finally{
    clearTimeout(timer);release.resolve();if(intercepting)await finished.promise
    await map.page.unroute(pattern,pause)
  }
}

function failure(kind,error){
  const line=String(error.stack).match(/host-mindmap\.mjs:\d+:\d+/)?.[0]
  const message=String(error.message).split(/\r?\n/,1)[0].replaceAll(password,'[redacted]')
  return {phase,kind,type:error.name,line,message}
}

try{
  trace=[];host=await isolate(candidate,entry);facts.binding=host.facts
  const started=await boot(),cookie=await entryCookie(started.entry)
  const ownerStatus=await api(host.port,cookie.cookie,'POST',prefix+'/auth/bootstrap',{login_name:'owner',display_name:'Owner',password})
  assert.equal(ownerStatus.status,201)
  const peerStatus=await api(host.port,'','POST',prefix+'/auth/register',{login_name:'peer',display_name:'Peer',password})
  assert.equal(peerStatus.status,201)
  const schema=dbRead(rows=>rows('PRAGMA user_version')[0].user_version);assert.equal(schema,27);facts.sqlite_schema=schema
  const {chromium}=await import(pathToFileURL(host.playwright).href)
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--disable-background-networking','--disable-component-update','--disable-sync','--no-proxy-server',
  ]});facts.chrome=browser.version()

  test='T01';phase='T01 create real citation and open two views in one business context'
  const outline={...await login('owner'),mode:'outline'},src=await fixture(outline)
  await open(outline,src.id);const initial=await state(outline,src.id)
  assert.equal(initial.n.revision,1);assert.equal(initial.graph.ordered.length,1)
  const map={...outline,page:await newPage(outline.ctx),mode:'map'}
  await open(map,src.id)
  for(const v of [outline,map]){v.watch=watch(v,src.id);await observeSignal(v);await chromeState(v,initial)}
  await returnDuringRead(map,src.id)
  const revised=await importText(outline,'Replacement of the fixed source, which must not retarget the note.',src.doc)
  assert.equal(revised.id,src.doc.id);assert.equal(revised.version,2);assert.notEqual(revised.version_id,src.doc.version_id)
  const paths=await twoViews(outline,map,src,initial),afterConflict=await conflict(outline,map,src,paths)
  await privatePeer(outline,src,afterConflict)
  phase='T01 fixed citation survives both views and replacement source'
  await foreground(map);await fixedReference(map,src,initial)
  pass('A17_FIXED_REFERENCE_UNCHANGED',{fixed_version:src.doc.version_id,current_version:revised.version_id,original_sha256:hash(sourceText)})
  facts.T01='PASS'

  test='T02';await layoutAndRestart(outline,map,src,initial,afterConflict,paths.deep);facts.T02='PASS'
  test=undefined;facts.A17='PASS';facts.status='PASS'
}catch(error){
  if(test){facts[test]='FAIL';facts.A17='FAIL'}
  facts.status='FAIL';facts.failure=failure('assertion_or_runtime',error)
}finally{
  phase='cleanup'
  for(const close of [()=>browser?.close(),()=>host?.stop()]){
    try{const result=await close();if(result)facts.last_host_exit=result}catch(error){
      facts.status='FAIL';(facts.cleanup_failures??=[]).push(failure('cleanup',error))
    }
  }
  facts.live_mutations=trace
  facts.exit=facts.status==='PASS'?0:1
  const summary=join(out,'summary.json'),body=JSON.stringify(facts,null,2)+'\n'
  writeFileSync(summary,body,{flag:'wx'})
  console.log(`${facts.status} ${summary} sha256=${hash(body)}`)
  if(facts.failure)console.error(`${facts.failure.phase}: ${facts.failure.type}: ${facts.failure.message}`)
  process.exitCode=facts.exit
}
