#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Get working state from a workspace.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to working-state.json
 * @returns {Promise<object>} - parsed working state object
 */
export async function getWorkingState({
  workspace,
  input: inputPath,
} = {}) {
  const root = workspace || process.cwd();
  const finalInputPath = inputPath || path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');
  const raw = await fs.readFile(path.resolve(finalInputPath), 'utf8');
  return JSON.parse(raw);
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const input = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : undefined;
  const result = await getWorkingState({ workspace, input });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[get-working-state] failed:', err);
    process.exit(1);
  });
}
