// Preloaded only in the isolated CLI process, never in the product package.
import { registerHooks } from 'node:module'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
registerHooks({load(url, ctx, next) {
  const result=next(url,ctx)
  if(url.startsWith('file:') && /knowledgeos-panel\/lib\/index\.js(?:[?#]|$)/.test(url)) {
    const path=realpathSync(fileURLToPath(url));appendFileSync(process.env.FND006_TRACE,JSON.stringify({pid:process.pid,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})+'\n')
  }
  return result
}})
