#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { buildRuntimeContextFromWorkingState, buildWorkingEvent, defaultWorkingState, mergeWorkingState } from '../working/state.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), input: null, state: null, write: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--input') out.input = argv[++i];
    else if (a === '--state') out.state = argv[++i];
    else if (a === '--write') out.write = true;
  }
  return out;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Update working state from input delta and optionally write to disk.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to update-input.json
 * @param {string} [options.state] - path to working-state.json
 * @param {boolean} [options.write=false] - write updated state to disk
 * @returns {Promise<{ok: boolean, state: object, event: object, runtimeContext: object, written: boolean}>}
 */
export async function updateWorkingState({
  workspace,
  input: inputPath,
  state: statePath,
  write = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalInputPath = inputPath || path.join(root, 'examples', 'working-memory', 'update-input.json');
  const finalStatePath = statePath || path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');

  const input = await readJson(finalInputPath, null);
  if (!input) throw new Error(`input not found: ${finalInputPath}`);

  const current = await readJson(finalStatePath, defaultWorkingState(input.seed || {}));
  const next = mergeWorkingState(current, { ...(input.delta || {}), memory_version: input.memory_version || input.delta?.memory_version }, input.policy || {});
  const event = buildWorkingEvent({
    sessionKey: next.session_key,
    trigger: input.trigger || 'manual:update',
    summary: input.summary || next.last_agent_action_summary || next.user_request_summary,
    stateDelta: input.delta || {},
    stateVersion: input.memory_version || next.memory_version,
  });
  const runtimeContext = buildRuntimeContextFromWorkingState(next, { memoryVersion: input.memory_version || next.memory_version });

  if (write) {
    await fs.writeFile(finalStatePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    await fs.writeFile(path.join(root, 'examples', 'working-memory', 'session-demo.working-event.json'), JSON.stringify(event, null, 2) + '\n', 'utf8');
    await fs.writeFile(path.join(root, 'examples', 'working-memory', 'session-demo.runtime-context.json'), JSON.stringify(runtimeContext, null, 2) + '\n', 'utf8');
    await fs.writeFile(path.join(root, 'examples', 'working-memory', 'session-demo.runtime-context.txt'), `${runtimeContext.content}\n`, 'utf8');
  }

  return { ok: true, state: next, event, runtimeContext, written: write };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const result = await updateWorkingState(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[update-working-state] failed:', err);
    process.exit(1);
  });
}
