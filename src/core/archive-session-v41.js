#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { archiveSession } from '../runtime/archive-session.js';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

/**
 * Archive a session from files in a workspace.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.packet] - path to session-packet.json
 * @param {string} [options.state] - path to working-state.json
 * @param {string} [options.memoryVersion='v4.1'] - memory version
 * @returns {Promise<{ok: boolean, archive: object}>}
 */
export async function archiveSessionV41({
  workspace,
  packet: packetPath,
  state: statePath,
  memoryVersion = 'v4.1',
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalPacketPath = packetPath || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'session-packet.json');
  const finalStatePath = statePath || path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');

  const packet = await readJson(finalPacketPath);
  const workingState = await readJson(finalStatePath);
  const archive = await archiveSession({ packet, workingState, memoryVersion });
  return { ok: true, archive };
}

// ─── CLI shell ─────────────────────────────────

function parseArgs(argv) {
  const out = { workspace: process.cwd(), packet: null, state: null, memoryVersion: 'v4.1' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--packet') out.packet = argv[++i];
    else if (a === '--state') out.state = argv[++i];
    else if (a === '--memory-version') out.memoryVersion = argv[++i];
  }
  return out;
}

async function cliMain() {
  const args = parseArgs(process.argv);
  const result = await archiveSessionV41(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
  cliMain().catch((err) => {
    console.error('[archive-session-v41] failed:', err);
    process.exit(1);
  });
}
