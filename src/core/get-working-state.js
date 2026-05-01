#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { getPaths } from '../lib/paths.js';
import { parsePresetArgs } from '../lib/cli-args.js';

/**
 * Get working state from a workspace.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to working-state.json
 * @param {string} [options.preset] - paths preset
 * @param {object} [options.override] - partial paths override
 * @param {object} [options.paths] - pre-resolved paths (skips getPaths call)
 * @returns {Promise<object>} - parsed working state object
 */
export async function getWorkingState({
  workspace,
  input: inputPath,
  preset,
  override,
  paths: paths_in,
} = {}) {
  const paths = paths_in ?? getPaths({ workspace, preset, override });
  const finalInputPath = inputPath || path.join(paths.workingMemoryRead, 'session-demo.working-state.json');
  const raw = await fs.readFile(path.resolve(finalInputPath), 'utf8');
  return JSON.parse(raw);
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const presetArgs = parsePresetArgs(process.argv);
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const input = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : undefined;
  const result = await getWorkingState({ workspace, input, ...presetArgs });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[get-working-state] failed:', err);
    process.exit(1);
  });
}
