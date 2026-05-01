import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePresetArgs } from '../../../src/lib/cli-args.js';

test('parsePresetArgs returns empty object when no flags', () => {
  const result = parsePresetArgs(['node', 'script.js']);
  assert.deepEqual(result, {});
});

test('parsePresetArgs extracts --preset value', () => {
  const result = parsePresetArgs(['node', 'script.js', '--preset', 'isolated']);
  assert.equal(result.preset, 'isolated');
  assert.equal(result.override, undefined);
});

test('parsePresetArgs throws on invalid preset', () => {
  assert.throws(
    () => parsePresetArgs(['node', 'script.js', '--preset', 'nonsense']),
    /invalid --preset value/
  );
});

test('parsePresetArgs reads --paths JSON file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cli-args-test-'));
  const file = path.join(dir, 'paths.json');
  writeFileSync(file, JSON.stringify({ registry: '/custom/reg' }));

  try {
    const result = parsePresetArgs(['node', 'script.js', '--preset', 'custom', '--paths', file]);
    assert.equal(result.preset, 'custom');
    assert.deepEqual(result.override, { registry: '/custom/reg' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePresetArgs throws when --paths file not readable', () => {
  assert.throws(
    () => parsePresetArgs(['node', 'script.js', '--preset', 'custom', '--paths', '/nonexistent/path.json']),
    /failed to read --paths file/
  );
});

test('parsePresetArgs throws on invalid JSON in --paths file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cli-args-test-'));
  const file = path.join(dir, 'bad.json');
  writeFileSync(file, '{not valid json');

  try {
    assert.throws(
      () => parsePresetArgs(['node', 'script.js', '--preset', 'custom', '--paths', file]),
      /failed to parse --paths file as JSON/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
