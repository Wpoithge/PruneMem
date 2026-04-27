import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isMainModule } from '../../../src/lib/cli-entry.js';

const helperPath = fileURLToPath(new URL('../../../src/lib/cli-entry.js', import.meta.url));

test('isMainModule returns true when this test file is the entry (node --test <file>)', () => {
  // node --test <file> sets argv[1] to <file>, matching import.meta.url after realpath.
  // This indirectly verifies the realpathSync-based comparison handles macOS /tmp symlink etc.
  assert.equal(isMainModule(import.meta.url), true);
});

test('isMainModule returns false when module is imported by another script (not main)', () => {
  // Spawn a subprocess where entry.mjs imports another.mjs, then check isMainModule
  // from inside another.mjs — it should return false because entry.mjs is the main module.
  const dir = mkdtempSync(path.join(tmpdir(), 'cli-entry-test-'));
  const entryPath = path.join(dir, 'entry.mjs');
  const anotherPath = path.join(dir, 'another.mjs');

  writeFileSync(anotherPath, [
    `import { isMainModule } from ${JSON.stringify(helperPath)};`,
    `export const result = isMainModule(import.meta.url);`,
  ].join('\n'));

  writeFileSync(entryPath, [
    `import { result } from './another.mjs';`,
    `process.stdout.write(result ? 'true' : 'false');`,
  ].join('\n'));

  try {
    const result = spawnSync(process.execPath, [entryPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
    assert.equal(result.stdout, 'false');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isMainModule returns true when module is run directly via node (spawned)', () => {
  // Spawn a subprocess where script.mjs is the entry — it should detect itself as main.
  const dir = mkdtempSync(path.join(tmpdir(), 'cli-entry-test-'));
  const scriptPath = path.join(dir, 'script.mjs');

  writeFileSync(scriptPath, [
    `import { isMainModule } from ${JSON.stringify(helperPath)};`,
    `process.stdout.write(isMainModule(import.meta.url) ? 'true' : 'false');`,
  ].join('\n'));

  try {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
    assert.equal(result.stdout, 'true');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
