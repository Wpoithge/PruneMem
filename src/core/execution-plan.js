#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { buildExecutionContext, createExecutionPlan, deriveMilestoneState } from '../runtime/execution-context.js';

/**
 * Create execution plan from input and derive milestone state and execution context.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to execution-plan input JSON
 * @returns {Promise<{ok: boolean, plan: object, milestoneState: object, executionContext: object}>}
 */
export async function executionPlan({
  workspace,
  input: inputPath,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalInputPath = inputPath || path.join(root, 'examples', 'working-memory', 'execution-plan.input.json');
  const input = JSON.parse(await fs.readFile(finalInputPath, 'utf8'));
  const plan = createExecutionPlan(input);
  const milestoneState = deriveMilestoneState(plan);
  const executionContext = buildExecutionContext(plan, milestoneState);
  return { ok: true, plan, milestoneState, executionContext };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const input = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : undefined;
  const result = await executionPlan({ workspace, input });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[execution-plan] failed:', err);
    process.exit(1);
  });
}
