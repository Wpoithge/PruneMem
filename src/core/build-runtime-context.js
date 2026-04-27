#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildContextBundle, buildRuntimeContextFromWorkingState } from '../working/state.js';
import { buildExecutionContext } from '../runtime/execution-context.js';

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Build runtime context and context bundle from working state and execution plan.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.state] - path to working-state.json
 * @param {string} [options.plan] - path to execution-plan.json
 * @returns {Promise<{ok: boolean, runtimeContext: object, executionContext: object|null, bundle: object}>}
 */
export async function buildRuntimeContext({
  workspace,
  state: statePath,
  plan: planPath,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalStatePath = statePath || path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');
  const finalPlanPath = planPath || path.join(root, 'examples', 'working-memory', 'session-demo.execution-plan.json');

  const state = await readJson(finalStatePath, {});
  const plan = await readJson(finalPlanPath, null);
  const runtimeContext = buildRuntimeContextFromWorkingState(state, { memoryVersion: state.memory_version });
  const executionContext = plan ? buildExecutionContext(plan) : null;
  const bundle = buildContextBundle({
    workingState: state,
    runtimeContext,
    executionContext,
    archiveRefs: state.related_archives || [],
  });
  return { ok: true, runtimeContext, executionContext, bundle };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const state = process.argv.includes('--state')
    ? process.argv[process.argv.indexOf('--state') + 1]
    : undefined;
  const plan = process.argv.includes('--plan')
    ? process.argv[process.argv.indexOf('--plan') + 1]
    : undefined;
  const result = await buildRuntimeContext({ workspace, state, plan });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[build-runtime-context] failed:', err);
    process.exit(1);
  });
}
