#!/usr/bin/env node
/** Prepare the audited upstream source without installing or running it. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !['--check', '--prepare', '--help'].includes(args[0]))) {
  process.stderr.write('Usage: node scripts/prepare-upstream.mjs [--check|--prepare|--help]\n');
  process.exit(64);
}
if (args[0] === '--help') {
  process.stdout.write('Default --check is read-only and offline. --prepare clones the locked upstream SHA; it never installs dependencies, builds, changes global DSH settings, resets existing work, or deletes data. Exit 2 means source not prepared, not a product test failure.\n');
  process.exit(0);
}
const prepare = args[0] === '--prepare';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function git(argv, cwd = root, allowFailure = false) {
  const result = spawnSync('git', argv, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) fail(`Git could not run: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail(`Git command failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
  return { code: result.status, stdout: result.stdout.trim() };
}

const lock = JSON.parse(readFileSync(resolve(root, 'config/upstream.lock.json'), 'utf8'));
const cfg = lock.upstream;
if (cfg.repository !== 'https://github.com/deepseek-ai/deepseek-harness.git') fail('Unexpected upstream repository; review the lockfile before changing this allowlist.');
if (!/^[a-f0-9]{40}$/.test(cfg.commit)) fail('The upstream lock must contain a full commit SHA.');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 9)) fail(`Node ${process.versions.node} is below upstream >=24.9.0.`);
const target = resolve(root, cfg.checkout_directory);
const rel = relative(root, target);
if (!rel || isAbsolute(rel) || rel.startsWith(`..${sep}`) || rel === '..' || !rel.startsWith(`.cache${sep}`)) fail('Checkout must remain below this repository .cache directory.');
const gitVersion = git(['--version']).stdout;

if (!existsSync(target)) {
  if (!prepare) {
    process.stdout.write(`${JSON.stringify({ status: 'NOT_PREPARED', node: process.versions.node, git: gitVersion, requiredPackageManager: cfg.package_manager, expectedCommit: cfg.commit, directory: target, next: 'node scripts/prepare-upstream.mjs --prepare' }, null, 2)}\n`);
    process.exit(2);
  }
  mkdirSync(dirname(target), { recursive: true });
  git(['clone', '--filter=blob:none', '--no-checkout', '--origin', 'origin', cfg.repository, target]);
  if (git(['cat-file', '-e', `${cfg.commit}^{commit}`], target, true).code !== 0) git(['fetch', '--no-tags', 'origin', cfg.commit], target);
  git(['checkout', '--detach', cfg.commit], target);
}

const top = git(['rev-parse', '--show-toplevel'], target).stdout;
if (realpathSync(top) !== realpathSync(target)) fail('Target is not its own repository checkout. Existing directories will not be overwritten.');
const remote = git(['remote', 'get-url', 'origin'], target).stdout.replace(/\/$/, '').replace(/\.git$/, '');
if (remote !== cfg.repository.replace(/\.git$/, '')) fail('Existing checkout origin differs from the approved upstream. No changes made.');
const dirty = git(['status', '--porcelain', '--untracked-files=normal'], target).stdout;
if (dirty) fail('Existing upstream checkout contains changes. Preserve it and create a separate integration worktree; this script does not reset or clean it.');
const actual = git(['rev-parse', 'HEAD'], target).stdout;
if (actual !== cfg.commit) fail(`Existing checkout is at ${actual}, expected ${cfg.commit}. No checkout/reset was performed; preserve existing work and resolve explicitly.`);
const pkg = JSON.parse(readFileSync(resolve(target, 'package.json'), 'utf8'));
if (pkg.version !== cfg.package_version || pkg.packageManager !== cfg.package_manager) fail('Pinned source package metadata does not match upstream.lock.json.');
process.stdout.write(`${JSON.stringify({ status: 'SOURCE_READY', commit: actual, directory: target, packageVersion: pkg.version, requiredPackageManager: pkg.packageManager, node: process.versions.node, git: gitVersion, dependenciesInstalledByThisScript: false, runtimeValidated: false }, null, 2)}\n`);
