// CLI version probe for R4 evidence. Usage: node R4-version-probe.mjs <dsh-root>
import { spawnSync } from 'node:child_process'
const dshRoot = process.argv[2]
const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '-V'], {
  cwd: dshRoot,
  env: process.env,
  encoding: 'utf8',
  timeout: 120_000,
  windowsHide: true,
})
console.log(JSON.stringify({ status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }, null, 2))