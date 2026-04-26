#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildExecutionContext, createExecutionPlan, deriveMilestoneState } from '../runtime/execution-context.js';

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const root = path.resolve(workspace);
  const inputPath = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : path.join(root, 'examples', 'working-memory', 'execution-plan.input.json');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const plan = createExecutionPlan(input);
  const milestoneState = deriveMilestoneState(plan);
  const executionContext = buildExecutionContext(plan, milestoneState);
  process.stdout.write(JSON.stringify({ ok: true, plan, milestoneState, executionContext }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[execution-plan] failed:', err);
  process.exit(1);
});
