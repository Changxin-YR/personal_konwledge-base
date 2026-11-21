const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'})
const token = /[\p{L}\p{N}\p{M}_]+(?:[.:/+\-]+[\p{L}\p{N}\p{M}_]+)*(?:\+\+|#)?/gu
const bilingual = [['deadlock', '\u6b7b\u9501'], ['mutex', '\u4e92\u65a5\u9501'], ['rollback', '\u56de\u6eda'],
  ['\u5b58\u53d6\u63a7\u5236\u6e05\u5355', '\u8bbf\u95ee\u63a7\u5236\u5217\u8868']] as const
const aliases = new Map<string, readonly string[]>(bilingual.flatMap(([a,b]) => [[a,[a,b]], [b,[b,a]]]))

type Range = {start:number;end:number}
export interface SearchQuery { readonly terms: readonly (readonly string[])[]; readonly phrase: string; readonly normalized: string }
export interface SearchText { readonly normalized:string; readonly ranges:readonly Range[]; readonly grams:ReadonlySet<string> }

const normalize = (s:string) => s.normalize('NFKC').toLowerCase()
const termGram = (s:string) => Array.from(s).slice(0,3).join('')
export function compileSearchQuery(raw:string):SearchQuery {
  if (raw.length > 256 || Array.from(raw).length > 128) throw new Error('INVALID_SEARCH_QUERY')
  const value=normalize(raw).trim().replace(/\(\)$/,'')
  const terms = [...new Set(value.match(token) ?? [])]
  if (!terms.length || terms.length > 12) throw new Error('INVALID_SEARCH_QUERY')
  return {terms:terms.map(term=>aliases.get(term) ?? [term]), phrase:value, normalized:terms.join(' ')}
}

export function indexSearchText(source:string):SearchText {
  const parts:string[]=[], ranges:Range[]=[]
  for(const {segment,index} of segmenter.segment(source)){
    const value=normalize(segment)
    parts.push(value)
    const range={start:index,end:index+segment.length}
    // Map every normalized UTF-16 unit back to the complete original grapheme.
    for(let i=0;i<value.length;i++)ranges.push(range)
  }
  const normalized=parts.join(''), codepoints=Array.from(normalized), grams=new Set<string>()
  for(let i=0;i<codepoints.length;i++){
    const a=codepoints[i]!,b=codepoints[i+1],c=codepoints[i+2]
    grams.add(a)
    if(b!==undefined)grams.add(a+b)
    if(c!==undefined)grams.add(a+b+c)
  }
  return {normalized,ranges,grams}
}

export function matchSearchText(index:SearchText,query:SearchQuery): (Range&{score:number})|null {
  const range=(at:number,length:number,score:number)=>({start:index.ranges[at]!.start,end:index.ranges[at+length-1]!.end,score})
  const exact=index.normalized.indexOf(query.phrase)
  if(exact!==-1)return range(exact,query.phrase.length,20+2*query.terms.length)
  let first:Range&{score:number}|undefined, score=0
  for(const variants of query.terms){
    let found:typeof first
    for(const [i,text] of variants.entries()){
      if(!index.grams.has(termGram(text)))continue
      const at=index.normalized.indexOf(text)
      if(at!==-1){found=range(at,text.length,i===0?2:1);break}
    }
    if(!found)return null
    first??=found
    score+=found.score
  }
  return first?{start:first.start,end:first.end,score}:null
}
