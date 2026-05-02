#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { getPaths } from '../lib/paths.js';
import { parsePresetArgs } from '../lib/cli-args.js';
import { curatorApply } from './curator-apply.js';
import { validateMaintenance } from './validate-maintenance.js';
import { repairSourcePaths } from './repair-source-paths.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), write: false, strict: false, repairSourcePaths: false, timeoutMs: 120000 };
  const presetArgs = parsePresetArgs(argv);
  Object.assign(out, presetArgs);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset' || a === '--paths') { i++; continue; }

    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--write') out.write = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--repair-source-paths') out.repairSourcePaths = true;
    else if (a === '--timeout-ms') out.timeoutMs = Number(argv[++i] || 120000);
  }
  return out;
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
 * @param {number} [options.timeoutMs=120000] - deprecated, no-op since Step 2b (all steps run in-process)
 * @returns {Promise<{ok: boolean, summary: object, steps: array}>}
 */
export async function maintain({
  workspace,
  write = false,
  strict = false,
  repairSourcePaths = false,
  timeoutMs = 120000,
  preset,
  override,
  paths: paths_in,
} = {}) {
  const paths = paths_in ?? getPaths({ workspace, preset, override });
  const root = paths.workspace;

  if (timeoutMs !== 120000) {
    process.stderr.write('[maintain] warning: --timeout-ms is deprecated and has no effect since Step 2b refactor (all steps run in-process)\n');
  }

  const steps = [
    { name: 'validate-maintenance(pre)', fn: () => validateMaintenance({ paths, strict }) },
    { name: 'curator-apply', fn: () => curatorApply({ paths, write }) },
  ];

  if (repairSourcePaths) {
    steps.push({ name: 'repair-source-paths', fn: () => repairSourcePaths({ paths, write }) });
  }

  steps.push({ name: 'validate-maintenance(post)', fn: () => validateMaintenance({ paths, strict }) });

  const results = [];
  for (const step of steps) {
    const startedAt = Date.now();
    let result;
    try {
      const parsed = await step.fn();
      result = { name: step.name, ok: parsed.ok !== false, code: 0, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout: '', stderr: '', parsed };
    } catch (err) {
      result = { name: step.name, ok: false, code: null, signal: null, timed_out: false, duration_ms: Date.now() - startedAt, stdout: '', stderr: String(err), parsed: null };
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

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[maintain] failed:', err);
    process.exit(1);
  });
}
