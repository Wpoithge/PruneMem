#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { archiveSession } from '../runtime/archive-session.js';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const root = path.resolve(workspace);
  const packetPath = process.argv.includes('--packet')
    ? process.argv[process.argv.indexOf('--packet') + 1]
    : path.join(root, 'examples', 'pipeline', 'sample-run-01', 'session-packet.json');
  const statePath = process.argv.includes('--state')
    ? process.argv[process.argv.indexOf('--state') + 1]
    : path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json');

  const packet = await readJson(packetPath);
  const workingState = await readJson(statePath);
  const archive = await archiveSession(packet, { workingState, memoryVersion: 'v4.1' });
  process.stdout.write(JSON.stringify({ ok: true, archive }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[archive-session-v41] failed:', err);
  process.exit(1);
});
