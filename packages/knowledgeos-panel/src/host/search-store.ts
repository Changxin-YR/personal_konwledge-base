import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'
import {compileSearchQuery,indexSearchText,matchSearchText,type SearchText} from './search-lexical.ts'

export const SEARCH_SCHEMA=`CREATE TABLE search_queries (
  query_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), scope_filter TEXT NOT NULL,
  normalized_query TEXT NOT NULL, index_version TEXT NOT NULL, result_source_versions TEXT NOT NULL,
  ranking_inputs TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX search_queries_actor ON search_queries(actor_id,created_at);`

const indexVersion='lexical-nfkc-v2'
// A real 664-page textbook has ~1.9M UTF-16 units. Still bound both
// normalization work and per-source bookkeeping, independently of the result cap.
const maxWork=4*1024*1024, maxSources=20_000, maxResults=30, maxCache=256_000
const sha=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex')
const sourceSQL=`SELECT v.asset_id AS asset_id,v.id AS version_id,v.version,v.original_name AS title,
    p.page AS ordinal,p.chapter AS chapter,'pdf' AS kind,p.state AS state,p.text AS text,NULL AS conversion_id
  FROM asset_versions v JOIN pdf_pages p ON v.id=p.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?))
    AND p.state IN ('ready','review') AND length(p.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,b.ordinal,b.kind,'text','ready',b.text,NULL
  FROM asset_versions v JOIN text_blocks b ON v.id=b.version_id WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND length(b.text)>0
  UNION ALL
  SELECT v.asset_id,v.id,v.version,v.original_name,p.page,'','office','ready',p.text,c.id
  FROM asset_versions v JOIN office_conversions c ON c.version_id=v.id JOIN word_search_runs r
    ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
  WHERE v.asset_id IN (SELECT value FROM json_each(?)) AND c.state='ready' AND p.page<=c.page_count`

interface Unit {asset_id:string;version_id:string;version:number;title:string;ordinal:number;chapter:string;kind:'text'|'pdf'|'office';state:string;text:string;conversion_id:string|null}
type Candidate=Omit<Unit,'text'|'conversion_id'>&{start:number;end:number;score:number;source_hash:string;quote:string;snippet:string;conversion_id?:string}
type SourceWitness=Pick<Candidate,'asset_id'|'version_id'|'ordinal'|'source_hash'|'kind'|'state'|'conversion_id'>

export class SearchStore {
  private cache=new Map<string,{index:SearchText;weight:number}>()
  private weight=0

  constructor(private tx:ParseTx,private current:(a:SessionActor,now:string)=>SessionActor|undefined,
    private allowed:(a:SessionActor,id:string,now:string)=>boolean){}

  private actor(a:SessionActor,now:string){const current=this.current(a,now);if(!current)throw new AssetError(401,'AUTH_REQUIRED');return current}
  private indexed(hash:string,text:string){
    const hit=this.cache.get(hash)
    if(hit){this.cache.delete(hash);this.cache.set(hash,hit);return hit.index}
    const index=indexSearchText(text),weight=index.ranges.length
    if(weight>maxCache)return index
    while(this.weight+weight>maxCache){const key=this.cache.keys().next().value!;this.weight-=this.cache.get(key)!.weight;this.cache.delete(key)}
    this.cache.set(hash,{index,weight});this.weight+=weight;return index
  }

  search(prior:SessionActor,raw:string){
    let query;try{query=compileSearchQuery(raw)}catch{throw new AssetError(422,'INVALID_SEARCH_QUERY')}
    const candidates=this.tx('read',(db,now)=>{
      const a=this.actor(prior,now)
      // Only identifiers are enumerated here. Content, matches and rank are restricted to the allowed set.
      const ids=db.prepare(`SELECT a.id FROM assets a JOIN knowledge_objects o ON a.id=o.id WHERE o.service_id=? AND o.status='active'`)
        .all(a.serviceId).map(r=>String(r.id)).filter(id=>this.allowed(a,id,now))
      const bound=JSON.stringify(ids),results:Candidate[]=[]
      let work=0,sources=0
      for(const row of db.prepare(sourceSQL).iterate(bound,bound,bound)){
        const {text,conversion_id,...source}=row as unknown as Unit
        work+=text.length
        if(work>maxWork||++sources>maxSources)throw new AssetError(503,'SEARCH_WORK_LIMIT')
        const source_hash=sha(text),match=matchSearchText(this.indexed(source_hash,text),query)
        if(!match)continue
        const from=Math.max(0,match.start-70),to=Math.min(text.length,match.end+70)
        const snippet=text.slice(from,to).replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g,'')
        results.push({...source,...(conversion_id?{conversion_id}:{}),...match,source_hash,quote:text.slice(match.start,match.end),snippet})
      }
      return results.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'zh-CN')||
        a.asset_id.localeCompare(b.asset_id)||b.version-a.version||a.ordinal-b.ordinal||(a.conversion_id??'').localeCompare(b.conversion_id??''))
    })
    return this.tx('write',(db,now)=>{
      const a=this.actor(prior,now),decisions=new Map<string,boolean>()
      const items:Candidate[]=[]
      for(const item of candidates){
        if(!decisions.has(item.asset_id))decisions.set(item.asset_id,this.allowed(a,item.asset_id,now))
        if(!decisions.get(item.asset_id)||!this.unchanged(db,item))continue
        items.push(item)
        if(items.length===maxResults)break
      }
      const query_id=randomUUID(),scope_filter='readable_parsed_assets'
      db.prepare('INSERT INTO search_queries VALUES(?,?,?,?,?,?,?,?)').run(query_id,a.userId,scope_filter,query.normalized,indexVersion,
        JSON.stringify([...new Set(items.map(i=>i.version_id))]),JSON.stringify(items.map(({asset_id,version_id,ordinal,source_hash,kind,state,start,end,score,conversion_id})=>
          ({asset_id,version_id,ordinal,source_hash,kind,state,start,end,score,conversion_id}))),now)
      // The receipt witnesses precisely the returned rows, including the count.
      return {query_id,actor_id:a.userId,count:items.length,items}
    })
  }

  revalidate(prior:SessionActor,queryId:string){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now),row=db.prepare('SELECT ranking_inputs FROM search_queries WHERE query_id=? AND actor_id=?').get(queryId,a.userId)
    if(!row)throw new AssetError(404,'SEARCH_UNAVAILABLE')
    const sources=JSON.parse(String(row.ranking_inputs)) as SourceWitness[]
    if(sources.some(s=>!this.allowed(a,s.asset_id,now)||!this.unchanged(db,s)))throw new AssetError(404,'SEARCH_UNAVAILABLE')
    return {actor_id:a.userId,query_id:queryId}
  })}

  private unchanged(db:DatabaseSync,item:SourceWitness){
    const source=item.kind==='office'?db.prepare(`SELECT p.text,c.state FROM office_conversions c JOIN asset_versions v ON v.id=c.version_id
      JOIN word_search_runs r ON r.conversion_id=c.id AND r.result_blob_id=c.result_blob_id JOIN word_search_pages p ON p.conversion_id=c.id
      WHERE v.asset_id=? AND v.id=? AND p.page=? AND c.id=? AND p.page<=c.page_count`).get(item.asset_id,item.version_id,item.ordinal,item.conversion_id??null) :
      item.kind==='pdf' ? db.prepare(`SELECT p.text,p.state FROM pdf_pages p JOIN asset_versions v ON v.id=p.version_id
      WHERE v.asset_id=? AND v.id=? AND p.page=?`).get(item.asset_id,item.version_id,item.ordinal) :
      db.prepare(`SELECT b.text,'ready' AS state FROM text_blocks b JOIN asset_versions v ON v.id=b.version_id
      WHERE v.asset_id=? AND v.id=? AND b.ordinal=?`).get(item.asset_id,item.version_id,item.ordinal)
    return source?.state===item.state && typeof source.text==='string' && sha(source.text)===item.source_hash
  }
}
