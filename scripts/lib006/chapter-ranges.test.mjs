import assert from 'node:assert/strict'
import test from 'node:test'
import {pdfChapterLocation,pdfChapters} from '../../packages/knowledgeos-panel/src/host/pdf-chapters.ts'

test('chapter ranges map first, midpoint, last and disjoint selections to original physical pages',()=>{
  const ranges=pdfChapters([[1,18],[40,600],[700,730]],730)
  assert.deepEqual(ranges,[[1,18],[40,600],[700,730]])
  const positions=[[1,1,1],[1,18,18],[2,1,40],[2,281,320],[2,561,600],[3,1,700],[3,31,730]]
  for(const [chapter,page,expected] of positions)assert.equal(pdfChapterLocation(ranges,chapter,page),expected)
  for(const [chapter,page] of [[0,1],[4,1],[3,32],[1,0],[1,1.5]])assert.throws(()=>pdfChapterLocation(ranges,chapter,page),/INVALID_PDF_CHAPTER_PAGE/)
  assert.deepEqual(pdfChapters([[1,1],[2,730]],730),[[1,1],[2,730]])
})

test('invalid chapter ranges fail before scheduling without truncation or coercion',()=>{
  for(const input of [null,{},[],[[]],[[0,1]],[[2,1]],[[1,731]],[[1,5],[5,8]],[[8,9],[6,7]],
    [['1',30]],[[true,6]],[[0.25,4]],[[1,Infinity]],[[1,2,3]],Array.from({length:101},(_,i)=>[i+1,i+1])]){
    assert.throws(()=>pdfChapters(input,730),/INVALID_PDF_CHAPTERS/)
  }
  assert.throws(()=>pdfChapters([[1,1]],10001),/INVALID_PDF_CHAPTERS/)
})
