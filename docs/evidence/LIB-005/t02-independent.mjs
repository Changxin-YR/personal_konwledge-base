import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const sha='4675aa7ed8ad1ac2501cdd2a63de769707ceaf5f', tree=resolve(process.argv[2]);
const entry='463c464bc06ee56ced7291482403ca6b5e7fcadb509672e9b823169511d90b46';
const self=fileURLToPath(import.meta.url), hash=b=>createHash('sha256').update(b).digest('hex');
const reader='packages/knowledgeos-panel/src/host/zip-reader.ts', fixture='scripts/lib004/acceptance-samples.mjs';
if(process.argv[3]==='--child'){
  assert.equal(process.permission.has('fs.write'),false);
  assert.equal(process.permission.has('fs.write',process.cwd()),false);
  const {inspectZip,preflightZipSelection,readZipMember,ZipInputError,ZIP_LIMITS}=await import(pathToFileURL(join(tree,reader)));
  const {zip}=await import(pathToFileURL(join(tree,fixture)));
  const member=64*1024**2,total=128*1024**2,cases=[];
  assert.equal(ZIP_LIMITS.memberBytes,member);assert.equal(ZIP_LIMITS.expandedBytes,total);
  const error=code=>e=>e instanceof ZipInputError && e.code===code;
  function meta(label,sizes,accept){
    // Only empty records. There is no compressed payload. Never call a decoder on these headers.
    const b=zip(Object.fromEntries(sizes.map((_,i)=>['part'+i+'.txt',''])));
    let c=b.readUInt32LE(b.length-6);
    for(const size of sizes){
      const l=b.readUInt32LE(c+42);
      assert.equal(b.readUInt32LE(l+18),0);assert.equal(b.readUInt32LE(c+20),0);
      b.writeUInt16LE(8,l+8);b.writeUInt16LE(8,c+10);
      b.writeUInt32LE(size,l+22);b.writeUInt32LE(size,c+24);
      c+=46+b.readUInt16LE(c+28);
    }
    assert.equal(c,b.length-22);assert(b.length<512);
    if(accept)assert.deepEqual(inspectZip(b).map(e=>e.size),sizes);
    else assert.throws(()=>inspectZip(b),error('ZIP_LIMIT_EXCEEDED'));
    cases.push({label,declared:sizes,total:sizes.reduce((a,b)=>a+b,0),input_bytes:b.length,packed_payload_bytes:0,sha256:hash(b),observed:accept?'metadata admitted':'ZIP_LIMIT_EXCEEDED'});
  }
  meta('member at limit',[member],true);meta('member over limit',[member+1],false);
  meta('aggregate at limit',[member,member],true);meta('aggregate over limit',[member,member,1],false);
  const empty=zip({});assert.equal(empty.length,22);assert.deepEqual(inspectZip(empty),[]);
  const outer=zip({'folder/empty.zip':empty});assert.throws(()=>inspectZip(outer),error('ZIP_NESTED_ARCHIVE'));
  cases.push({label:'ordinary nested empty ZIP',inner_bytes:empty.length,input_bytes:outer.length,sha256:hash(outer),observed:'ZIP_NESTED_ARCHIVE'});
  const name='folder/note.txt', payload=Buffer.from('in-memory note'), normal=zip({[name]:payload});
  assert.deepEqual(inspectZip(normal).map(e=>e.path),[name]);await preflightZipSelection(normal,[0]);
  assert.deepEqual(await readZipMember(normal,0),payload);
  cases.push({label:'normal selection after rejection without filesystem writes',path:name,sha256:hash(normal),observed:'manifest, preflight and byte comparison passed'});
  console.log(JSON.stringify({status:'PASS',node:process.version,candidate:sha,entry_sha256:entry,script_sha256:hash(readFileSync(self)),reader_sha256:hash(readFileSync(join(tree,reader))),child_fs_write_permission:false,cases}));
}else{
  const out=resolve(process.argv[3]);mkdirSync(out,{recursive:true});const run=mkdtempSync(join(out,'t02-')),cwd=join(run,'work');mkdirSync(cwd);
  const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:tree});
  assert.equal(git('rev-parse','HEAD').toString().trim(),sha);assert.equal(git('rev-parse','--abbrev-ref','HEAD').toString().trim(),'HEAD');
  for(const p of [reader,fixture,'packages/knowledgeos-panel/src/host/word-original.ts','packages/knowledgeos-panel/src/host/office-schema.ts'])assert.equal(hash(readFileSync(join(tree,p))),hash(git('show',sha+':'+p)));
  assert.equal(hash(readFileSync(join(tree,'packages/knowledgeos-panel/lib/index.js'))),entry);
  mkdirSync(join(cwd,'folder'));writeFileSync(join(cwd,'folder/note.txt'),'existing sentinel',{flag:'wx'});
  const snapshot=dir=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>[x.name,x.isDirectory()?snapshot(join(dir,x.name)):hash(readFileSync(join(dir,x.name)))]);
  const before=snapshot(cwd),args=['--permission','--allow-fs-read=*','--experimental-transform-types',self,tree,'--child'];
  const file=join(run,'summary.json');let report;
  try{
    const text=execFileSync(process.execPath,args,{cwd,encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_DISABLE_COMPILE_CACHE:'1'}});
    const after=snapshot(cwd);assert.deepEqual(after,before);report={...JSON.parse(text),workdir_before:before,workdir_after:after,actual_child_args:args};
  }catch(e){report={status:'FAIL',message:e.message};process.exitCode=1;}
  writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report.status,file);
}
