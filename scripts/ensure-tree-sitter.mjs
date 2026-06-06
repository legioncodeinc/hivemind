#!/usr/bin/env node
// Ensures the native tree-sitter bindings are loadable on this platform / Node ABI.
//
// Why this exists: tree-sitter@0.21.x ships no linux-arm64 prebuild, and
// tree-sitter-typescript@0.23.x ships a mislabeled (x86-64) one. On linux-arm64
// both must be compiled from source, and under Node >=22 that compile requires C++20
// (tree-sitter@0.21's binding.gyp does not request it). tree-sitter is declared as an
// optionalDependency so this expected arm64 build failure does not abort `npm install`;
// this script then heals it afterwards.
//
// On platforms where the shipped prebuilds work (x64 / darwin / CI) this is a fast
// no-op and never touches anything. It is intentionally non-fatal: if no toolchain is
// available it warns and exits 0 rather than breaking the install.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(`${ROOT}/`);
const PKGS = [
  'tree-sitter',
  'tree-sitter-typescript',
  'tree-sitter-javascript',
  'tree-sitter-python',
  'tree-sitter-go',
  'tree-sitter-rust',
  'tree-sitter-java',
  'tree-sitter-ruby',
  'tree-sitter-c',
  'tree-sitter-cpp',
];

function bindingsLoad() {
  try {
    const Parser = require('tree-sitter');
    const TS = require('tree-sitter-typescript').typescript;
    const parser = new Parser();
    parser.setLanguage(TS);
    parser.parse('const x = 1;');
    // B6: also verify the Python grammar loads on this platform / Node ABI.
    const Py = require('tree-sitter-python');
    const pyParser = new Parser();
    pyParser.setLanguage(Py);
    pyParser.parse('x = 1\n');
    return true;
  } catch {
    return false;
  }
}

if (process.env.ENSURE_TS_RUNNING) process.exit(0); // recursion guard for the nested npm calls below
if (bindingsLoad()) process.exit(0); // healthy prebuild / prior build → nothing to do

console.error('[ensure-tree-sitter] native bindings not loadable on this platform — building from source...');

const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8'));
const declared = { ...pkg.dependencies, ...pkg.optionalDependencies };

const env = { ...process.env, ENSURE_TS_RUNNING: '1' };
if (process.platform !== 'win32') {
  // Node >=22 V8 headers require C++20; tree-sitter@0.21's binding.gyp doesn't request it.
  env.CXXFLAGS = `${process.env.CXXFLAGS ?? ''} -std=c++20`.trim();
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env, cwd: ROOT });

try {
  // 1. Re-fetch any package npm dropped — an optional dependency whose build failed is
  //    removed from node_modules. --ignore-scripts: fetch only, so the compile below is
  //    the single source of truth and the project build isn't triggered prematurely.
  const missing = PKGS.filter((n) => !existsSync(`${ROOT}/node_modules/${n}/package.json`));
  if (missing.length) {
    const specs = missing.map((n) => `${n}@${declared[n] ?? 'latest'}`);
    run(`npm install ${specs.join(' ')} --no-save --ignore-scripts`);
  }

  // 2. Force a from-source compile. These packages install via node-gyp-build, which uses
  //    a local prebuild when present and otherwise compiles from source — no network. By
  //    removing the (absent or wrong-arch) prebuilds plus any stale build, the rebuild is
  //    guaranteed to compile locally, and node-gyp-build loads build/Release ahead of
  //    prebuilds, so the correct binary always wins.
  for (const n of PKGS) {
    rmSync(`${ROOT}/node_modules/${n}/prebuilds`, { recursive: true, force: true });
    rmSync(`${ROOT}/node_modules/${n}/build`, { recursive: true, force: true });
  }
  run(`npm rebuild ${PKGS.join(' ')}`);
} catch (err) {
  console.error('[ensure-tree-sitter] rebuild command failed:', err.message);
}

if (bindingsLoad()) {
  console.error('[ensure-tree-sitter] OK — bindings compiled from source and loadable.');
  process.exit(0);
}

// Strict mode: turn the warning into a hard failure. Opt-in via
// HIVEMIND_STRICT_POSTINSTALL=1 — set by this repo's own CI workflows so a
// heal failure surfaces as a red check on the PR instead of getting swallowed
// and re-emerging downstream as `tsc: Cannot find module 'tree-sitter'`.
// Default stays non-fatal so end-user consumers of @deeplake/hivemind never
// get a hard install break — the runtime check at use-time is enough for them.
const strict = process.env.HIVEMIND_STRICT_POSTINSTALL === '1';
console.error(
  '[ensure-tree-sitter] WARNING: tree-sitter bindings still unavailable. ' +
    'Install a C/C++ toolchain and re-run `npm run rebuild:native`.' +
    (strict ? ' (strict mode — failing this install)' : ' (non-fatal)'),
);
process.exit(strict ? 1 : 0);
