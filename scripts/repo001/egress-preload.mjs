import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {appendFileSync} from 'node:fs'
import {join} from 'node:path'

assert.match(process.env.KO_TEST_LOOPBACK,/^http:\/\/127\.0\.0\.1:[0-9]+$/)
const trace=join(process.env.KO_RUN,'repository-egress.jsonl'), real=globalThis.fetch
const commit='a'.repeat(40),tree='b'.repeat(40),other='c'.repeat(40)
const content='<b>Literal Git content</b>\n[external](https://example.invalid/not-loaded)\n'
const bytes=Buffer.from(content),blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')
const sample=/^\/repos\/octocat\/Hello-World(?:\/commits\/refs%2Fheads%2F(?:master|test)|\/git\/(?:trees|blobs)\/[a-f0-9]{40})?$/
const mocked=/^\/repos\/synthetic\/(sample|redirect|truncated|unsafe-path|missing|broken-blob|unavailable|cancel|rate|secondary-rate|too-large|transport)(?:\/(.*))?$/
const labBase='/api/v4/projects/72724/repository/'
const labCommits=['ddd0f15ae83993f5cb66a927a28673882e99100b','498214de67004b1da3d820901307bed2a68a8ef6']
const labBlobs=['ea20973903d3800ac659d503596f9105f0a7423f','faaf198af3a36dbf41961466703cc1d47c61d051']
const labResource=['branches/master','branches/branch-merged','branches/knowledgeos-repo002-missing-ref',
  ...labCommits.map(id=>'commits/'+id),...labBlobs.map(id=>'blobs/'+id)]
function allowedLab(url){
  if(url.origin!=='https://gitlab.com')return false
  if(!url.search)return url.pathname.toLowerCase()==='/api/v4/projects/gitlab-org%2fgitlab-test'||labResource.some(resource=>url.pathname===labBase+resource)
  return url.pathname===labBase+'tree'&&labCommits.some(sha=>url.search==='?ref='+sha+'&recursive=true&per_page=100&page=1')
}
const save=(outcome,path,status)=>appendFileSync(trace,JSON.stringify({method:'GET',outcome,path,status})+'\n')
globalThis.fetch=async (input,init)=>{
  const url=new URL(input instanceof Request?input.url:input)
  if(url.origin===process.env.KO_TEST_LOOPBACK&&!url.username&&!url.password)return real(input,init)
  const path=url.pathname, method=init?.method??(input instanceof Request?input.method:'GET'),headers=new Headers(init?.headers)
  if(process.env.KO_REPOSITORY_TRAFFIC==='gitlab-public'){
    if(!allowedLab(url)||url.username||url.password||url.hash||method!=='GET'||init?.redirect!=='manual'||init?.body||
      ['authorization','private-token','cookie','job-token'].some(name=>headers.has(name))){
      save('denied','UNEXPECTED',0);throw Error('REPO002_FETCH_DENIED')
    }
    const response=await real(input,{...init,redirect:'error'});save('gitlab',path+url.search,response.status);return response
  }
  const allowedTree=path.includes('/git/trees/')?url.search==='?recursive=1':!url.search
  if(url.origin!=='https://api.github.com'||url.username||url.password||url.hash||!allowedTree||method!=='GET'||init?.redirect!=='manual'||init?.body||headers.has('authorization')){
    save('denied','UNEXPECTED',0);throw Error('REPO001_FETCH_DENIED')
  }
  if(process.env.KO_REPOSITORY_TRAFFIC==='public-fixture'&&sample.test(path)){
    const response=await real(input,{...init,redirect:'error'});save('github',path,response.status);return response
  }
  const match=mocked.exec(path)
  if(!match){save('denied','UNEXPECTED',0);throw Error('REPO001_FETCH_DENIED')}
  const [,repo,resource]=match
  const json=(value,status=200,headers={})=>{save('fixture',path,status);return Response.json(value,{status,headers})}
  if(repo==='redirect')return json(null,302,{location:'https://example.invalid/redirect'})
  if(repo==='missing')return json(null,404)
  if(repo==='rate')return json(null,403,{'x-ratelimit-remaining':'0'})
  if(repo==='secondary-rate')return json(null,403,{'x-ratelimit-remaining':'50','retry-after':'60'})
  if(repo==='unavailable')return json(null,503)
  if(repo==='transport'){save('fixture',path,0);throw new TypeError('synthetic transport failure')}
  if(repo==='cancel'){save('fixture',path,0);return new Promise((_,reject)=>{
    if(init.signal.aborted)return reject(init.signal.reason)
    init.signal.addEventListener('abort',()=>{save('cancelled',path,0);reject(init.signal.reason)},{once:true})
  })}
  if(!resource)return json({id:123,full_name:'synthetic/'+repo,private:false,visibility:'public'})
  if(resource==='commits/refs%2Fheads%2Fmain')return json({sha:commit,commit:{tree:{sha:tree}}})
  if(resource==='git/trees/'+tree){
    if(repo==='too-large')return json(null,200,{'content-length':'3000000'})
    return json({sha:tree,truncated:repo==='truncated',tree:[
      {path:repo==='unsafe-path'?'bad\u0001path':'README.md',sha:blob,type:'blob',mode:'100644',size:bytes.length},
      {path:'linked',sha:other,type:'blob',mode:'120000',size:8},
      {path:'nested',sha:other,type:'commit',mode:'160000'},
    ]})
  }
  if(resource==='git/blobs/'+blob)return json({sha:blob,size:bytes.length,encoding:'base64',content:(repo==='broken-blob'?Buffer.alloc(bytes.length,1):bytes).toString('base64')})
  save('denied','UNEXPECTED',0);throw Error('REPO001_FETCH_DENIED')
}
