#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { curatorApply } from './curator-apply.js';

// TODO: Replace remaining spawn() calls after Step 3 lib化完成:
// - validate-maintenance.js
// - repair-source-paths.js

function parseArgs(argv) {
  const out = { workspace: process.cwd(), write: false, strict: false, repairSourcePaths: false, timeoutMs: 120000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--write') out.write = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--repair-source-paths') out.repairSourcePaths = true;
    else if (a === '--timeout-ms') out.timeoutMs = Number(argv[++i] || 120000);
  }
  return out;
}

function truncate(text, max = 4000) {
  const s = String(text || '');
  return s.length <= max ? s : `${s.slice(0, max)}\n...[truncated]`;
}

async function runStep({ name, script, args, cwd, timeoutMs }) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch {}
      resolve({ name, ok: code === 0 && !signal && !timedOut, code, signal, timed_out: timedOut, duration_ms: Date.now() - startedAt, stdout: truncate(stdout), stderr: truncate(stderr), parsed });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ name, ok: false, code: null, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout: truncate(stdout), stderr: truncate(String(err)), parsed: null });
    });
  });
}

/**
 * Run maintenance pipeline on a workspace's registry.
 * Validates, applies curator decisions, optionally repairs source paths, then validates again.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {boolean} [options.write=false] - actually write changes
 * @param {boolean} [options.strict=false] - strict validation mode
 * @param {boolean} [options.repairSourcePaths=false] - run repair-source-paths step
 * @param {number} [options.timeoutMs=120000] - timeout per step in milliseconds
 * @returns {Promise<{ok: boolean, summary: object, steps: array}>}
 */
export async function maintain({
  workspace,
  write = false,
  strict = false,
  repairSourcePaths = false,
  timeoutMs = 120000,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const coreDir = path.join(root, 'src', 'core');

  const steps = [
    { name: 'validate-maintenance(pre)', script: path.join(coreDir, 'validate-maintenance.js'), args: ['--workspace', root, ...(strict ? ['--strict'] : [])] },
    { name: 'curator-apply', fn: () => curatorApply({ workspace: root, write }) },
  ];

  if (repairSourcePaths) {
    steps.push({ name: 'repair-source-paths', script: path.join(coreDir, 'repair-source-paths.js'), args: ['--workspace', root, ...(write ? ['--write'] : [])] });
  }

  steps.push({ name: 'validate-maintenance(post)', script: path.join(coreDir, 'validate-maintenance.js'), args: ['--workspace', root, ...(strict ? ['--strict'] : [])] });

  const results = [];
  for (const step of steps) {
    let result;
    if (step.fn) {
      const startedAt = Date.now();
      try {
        const parsed = await step.fn();
        result = { name: step.name, ok: parsed.ok !== false, code: 0, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout: '', stderr: '', parsed };
      } catch (err) {
        result = { name: step.name, ok: false, code: null, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout: '', stderr: truncate(String(err)), parsed: null };
      }
    } else {
      result = await runStep({ ...step, cwd: root, timeoutMs });
    }
    results.push(result);
    if (!result.ok) break;
  }

  const failed = results.find((r) => !r.ok) || null;
  return {
    ok: !failed,
    summary: { steps_total: steps.length, steps_run: results.length, steps_ok: results.filter((r) => r.ok).length, failed_step: failed?.name || null, write, strict, repair_source_paths: repairSourcePaths },
    steps: results.map((r) => ({ name: r.name, ok: r.ok, code: r.code, signal: r.signal, timed_out: r.timed_out, duration_ms: r.duration_ms, parsed: r.parsed, stderr: r.stderr || '' }))
  };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const result = await maintain(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[maintain] failed:', err);
    process.exit(1);
  });
}
