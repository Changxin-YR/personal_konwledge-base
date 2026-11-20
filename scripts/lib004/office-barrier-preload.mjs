// Only the candidate-bound isolated T02 Host preloads this. Hook the output
// write, not the converter, its input or the database publication decision.
import assert from 'node:assert/strict'
import {appendFileSync,existsSync,realpathSync} from 'node:fs'
import fs from 'node:fs/promises'
import {basename,dirname,join,resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
const trace=realpathSync(process.env.KO_RUN),root=resolve(process.env.KO_OFFICE_ORIGINALS)
const flag=name=>existsSync(join(trace,name)),used=new Set()
const record=event=>appendFileSync(join(trace,'boundary.jsonl'),JSON.stringify({event,pid:process.pid,at:Date.now()})+'\n')
const stages=new Map(),published=new Map(),link=fs.link.bind(fs),unlink=fs.unlink.bind(fs)
fs.link=async function(stage,target){await link(stage,target);if(stages.has(stage)){published.set(target,stages.get(stage));record('linked-'+stages.get(stage))}}
fs.unlink=async function(path){await unlink(path);if(published.has(path))record('discarded-'+published.get(path))}
const open=fs.open.bind(fs)
fs.open=async function(path,...args){
  const file=await open(path,...args)
  if(typeof path!=='string'||dirname(path)!==root||!/^\.[a-f0-9-]{36}\.pending$/.test(basename(path)))return file
  const write=file.writeFile.bind(file)
  file.writeFile=async function(data,...rest){
    if(Buffer.isBuffer(data)&&data.subarray(0,5).toString('ascii')==='%PDF-'){
      for(const mode of ['fail-result','hold-cancel','hold-stale']){
        if(used.has(mode)||!flag(mode))continue
        used.add(mode);record('entered-'+mode)
        if(mode==='fail-result')throw Error('Synthetic result storage failure')
        stages.set(path,mode)
        const end=Date.now()+60000
        while(!flag(mode.replace('hold','release'))){assert(Date.now()<end,'office barrier timed out');await delay(20)}
        record('released-'+mode)
      }
    }
    return write(data,...rest)
  }
  return file
}
