// Actual pinned panel markup and Chrome. All HTTP is intercepted synthetic data.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {buildAiHtml} from '../../packages/knowledgeos-panel/src/host/ai-page.ts'
import {capture} from './candidate-live-capture.mjs'
import {title,bodies,sha} from './candidate-live-guards.mjs'
const pw=join(resolve(process.env.KO_TEST_CACHE??'.cache'),'panel-builder/node_modules/playwright/index.mjs')
test('real Chrome captures both post-read revisions and excludes unreviewed DOM from pixels',{skip:!existsSync(pw)&&'Playwright cache unavailable'},async()=>{
  const {chromium}=await import(pathToFileURL(pw).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']})
  try {
    const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage(),id=randomUUID(),base='http://127.0.0.1:3199',route={provider:'synthetic',model:'deepseek-test/route-a'};let revision=1
    const object=()=>({id,title,revision,body:bodies[revision-1]});await ctx.route('**/*',async req=>{
      const url=new URL(req.request().url());assert.equal(url.origin,base);if(url.pathname==='/knowledgeos/ai')return req.fulfill({contentType:'text/html; charset=utf-8',body:buildAiHtml()})
      const value={'/knowledge/v1/me':{id,display_name:'Synthetic testmember',login_name:'testmember'},'/knowledge/v1/ai/status':{...route,configured:true},'/knowledge/v1/objects':[object()],['/knowledge/v1/objects/'+id]:object()}[url.pathname]
      if(!value)return req.abort();return req.fulfill({json:{data:value}})
    });await page.goto(base+'/knowledgeos/ai');await page.waitForFunction(()=>document.querySelector('#status').textContent==='就绪');const hashes=[]
    for(revision=1;revision<=2;revision++) {
      await page.locator('#read').click();await page.waitForFunction(r=>document.querySelector('#status').textContent.endsWith('revision '+r),revision)
      const png=await capture(page,base,route,id,revision);hashes.push(sha(png));await page.locator('#result').evaluate(e=>{e.textContent='private fixture marker: never export'})
      assert.equal(sha(await capture(page,base,route,id,revision)),sha(png))
    }
    assert.notEqual(...hashes);await page.locator('#who').evaluate(e=>{e.textContent='wrong account'});await assert.rejects(capture(page,base,route,id,2));await page.evaluate(()=>history.replaceState(null,'','?owner=synthetic'));await assert.rejects(capture(page,base,route,id,2))
  } finally {await browser.close()}
})
