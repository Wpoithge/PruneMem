#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CLI_PATH = fileURLToPath(new URL('../../src/cli/bin.js', import.meta.url));
const WORKSPACE = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

let failed = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`ASSERT FAIL: ${message}`);
    failed = true;
  }
}

function run(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd: WORKSPACE,
  });
}

// 1. --version
{
  const res = run(['--version']);
  assert(res.status === 0, `version exit code should be 0, got ${res.status}`);
  assert(res.stdout.trim() === '0.4.0', `version output should be 0.4.0, got ${res.stdout.trim()}`);
  console.log('PASS: --version');
}

// 2. list-tools
{
  const res = run(['list-tools']);
  assert(res.status === 0, `list-tools exit code should be 0, got ${res.status}`);
  const lines = res.stdout.trim().split('\n').filter((l) => l.trim());
  assert(lines.length === 11, `list-tools should print 11 tools, got ${lines.length}`);
  assert(lines.every((l) => l.startsWith('prunemem_')), 'all tools should start with prunemem_');
  console.log('PASS: list-tools');
}

// 3. call runtime_context with --json
{
  const res = run([
    'call', 'runtime_context',
    '--json', JSON.stringify({ workspace: WORKSPACE, preset: 'isolated' }),
  ]);
  assert(res.status === 0, `runtime_context --json exit code should be 0, got ${res.status}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed !== null, `runtime_context --json stdout should be valid JSON`);
  assert(parsed.ok === true, `runtime_context --json should return ok: true`);
  assert(parsed.tool === 'prunemem_runtime_context', `runtime_context --json tool name should be resolved`);
  assert(parsed.result?.runtimeContext !== undefined, `runtime_context --json result should contain runtimeContext`);
  console.log('PASS: call runtime_context --json');
}

// 4. call with prunemem_ prefix
{
  const res = run([
    'call', 'prunemem_get_working_state',
    '--json', JSON.stringify({ workspace: WORKSPACE, preset: 'isolated' }),
  ]);
  assert(res.status === 0, `prefixed tool name exit code should be 0, got ${res.status}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed?.ok === true, `prefixed tool name should return ok: true`);
  assert(parsed?.tool === 'prunemem_get_working_state', `prefixed tool name should match exactly`);
  console.log('PASS: call prunemem_get_working_state (prefixed)');
}

// 5. nonexistent_tool → exit 2
{
  const res = run([
    'call', 'nonexistent_tool',
    '--json', '{}',
  ]);
  assert(res.status === 2, `nonexistent_tool exit code should be 2, got ${res.status}`);
  assert(res.stderr.includes('unknown tool'), `nonexistent_tool stderr should mention unknown tool, got: ${res.stderr}`);
  console.log('PASS: call nonexistent_tool (error handling)');
}

// 6. --arg key=value form
{
  const res = run([
    'call', 'runtime_context',
    '--arg', `workspace=${WORKSPACE}`,
    '--arg', 'preset=isolated',
  ]);
  assert(res.status === 0, `runtime_context --arg exit code should be 0, got ${res.status}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    parsed = null;
  }
  assert(parsed?.ok === true, `runtime_context --arg should return ok: true`);
  assert(parsed?.result?.runtimeContext !== undefined, `runtime_context --arg result should contain runtimeContext`);
  console.log('PASS: call runtime_context --arg');
}

if (failed) {
  console.error('\nSome assertions failed.');
  process.exit(1);
}
console.log('\nAll CLI smoke tests passed.');
