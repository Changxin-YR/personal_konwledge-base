import {registerHooks} from 'node:module'
import {readFileSync,realpathSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {sha} from './candidate-live-guards.mjs'
registerHooks({load(url,ctx,next){
  const result=next(url,ctx)
  if(url.startsWith('file:') && /knowledgeos-panel\/lib\/index\.js(?:[?#]|$)/i.test(url)) {
    const path=realpathSync(fileURLToPath(url)),hash=sha(readFileSync(path))
    if(path!==process.env.KO_ENTRY || hash!==process.env.KO_HASH) throw Error('CANDIDATE_LOAD_MISMATCH')
    writeFileSync(join(process.env.KO_RUN,'loaded.json'),JSON.stringify({pid:process.pid,hash}),{flag:'wx'})
  }
  return result
}})
