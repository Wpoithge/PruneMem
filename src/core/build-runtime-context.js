#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildContextBundle, buildRuntimeContextFromWorkingState } from '../working/state.js';
import { buildExecutionContext } from '../runtime/execution-context.js';

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const root = path.resolve(workspace);
  const statePath = process.argv.includes('--state')
    ? process.argv[process.argv.indexOf('--state') + 1]
    : path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');
  const planPath = process.argv.includes('--plan')
    ? process.argv[process.argv.indexOf('--plan') + 1]
    : path.join(root, 'examples', 'working-memory', 'session-demo.execution-plan.json');

  const state = await readJson(statePath, {});
  const plan = await readJson(planPath, null);
  const runtimeContext = buildRuntimeContextFromWorkingState(state, { memoryVersion: state.memory_version });
  const executionContext = plan ? buildExecutionContext(plan) : null;
  const bundle = buildContextBundle({
    workingState: state,
    runtimeContext,
    executionContext,
    archiveRefs: state.related_archives || [],
  });
  process.stdout.write(JSON.stringify({ ok: true, runtimeContext, executionContext, bundle }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[build-runtime-context] failed:', err);
  process.exit(1);
});
