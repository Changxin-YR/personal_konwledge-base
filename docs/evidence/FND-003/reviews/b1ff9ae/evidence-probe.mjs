import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [candidateArgument, outputArgument] = process.argv.slice(2);
if (!candidateArgument || !outputArgument || process.argv.length !== 4) throw new Error('Usage: node [runtime flags] <probe.mjs> <candidate-root> <output-json>');
const candidate = resolve(candidateArgument);
const out = resolve(outputArgument);
const work=mkdtempSync(join(tmpdir(),'kos-fnd003-evidence-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const manifest=JSON.parse(readFileSync(join(candidate,'docs/evidence/FND-003/candidate-manifest.json'),'utf8'));
  const repo=join(work,'repo');
  for(const file of Object.keys(manifest.files)){
    mkdirSync(dirname(join(repo,file)),{recursive:true});
    writeFileSync(join(repo,file),readFileSync(join(candidate,file)));
  }
  const profile=join(work,'profile');
  const wrongInstalled=join(work,'wrong-installed');
  mkdirSync(profile,{recursive:true});mkdirSync(join(wrongInstalled,'lib'),{recursive:true});
  writeFileSync(join(profile,'package.json'),JSON.stringify({dependencies:{'knowledgeos-panel':'link:../wrong-installed'}}));
  writeFileSync(join(wrongInstalled,'lib/index.js'),readFileSync(join(candidate,'packages/knowledgeos-panel/lib/index.js'),'utf8')+'\n// installed artifact intentionally differs\n');
  // Reproduce the exact comparison and profile resolution expressions in run-all.mjs 295-297.
  const loadedPackage=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'));
  const packageDir=resolve(profile,loadedPackage.dependencies['knowledgeos-panel'].replace(/^link:/,''));
  const compare=()=>{
    const mismatches=[];
    for(const [file,expected] of Object.entries(manifest.files)){
      const actual=createHash('sha256').update(readFileSync(join(repo,file))).digest('hex');
      if(actual!==expected.sha256)mismatches.push({file,expected:expected.sha256,actual});
    }
    return mismatches;
  };
  const installedMismatch=sha(readFileSync(join(packageDir,'lib/index.js')))!==manifest.files['packages/knowledgeos-panel/lib/index.js'].sha256;
  const first=compare();
  writeFileSync(join(repo,'packages/knowledgeos-panel/lib/index.js'),'tampered local source artifact\n');
  const second=compare();

  const independentSource=readFileSync(join(candidate,'scripts/fnd003/independent-verification.mjs'),'utf8');
  const checkLine=independentSource.split('\n').find(line=>line.startsWith('function check('));
  const execution=spawnSync(process.execPath,['--input-type=module','-e',`const results=[];\n${checkLine}\ncheck('synthetic-failed-assertion',[{ok:false,message:'intentional negative control'}]);\nconsole.log(JSON.stringify({result:results.every(item=>item.status==='PASS')?'PASS':'FAIL'}));`],{encoding:'utf8'});
  const result={
    scope:'isolated_extracted_test_harness_logic_only_not_a_Host_run',
    candidate_commit:'b1ff9ae506d98420796a6dd84d90e345a6eaa2d7',
    actual_installed_hash_differs:installedMismatch,
    repository_only_comparison_mismatches:first.length,
    assertion_would_pass_despite_wrong_installed_artifact:first.length===0,
    local_repository_artifact_negative_control_mismatches:second.length,
    independent_false_assertion_report:JSON.parse(execution.stdout),
    independent_false_assertion_exit_code:execution.status,
    production_files_modified:false,
  };
  writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{rmSync(work,{recursive:true,force:true});}
