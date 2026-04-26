#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const input = process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : path.join(workspace, 'examples', 'working-memory', 'session-demo.working-state.json');
  const raw = await fs.readFile(path.resolve(input), 'utf8');
  process.stdout.write(raw.trim() + '\n');
}

main().catch((err) => {
  console.error('[get-working-state] failed:', err);
  process.exit(1);
});
