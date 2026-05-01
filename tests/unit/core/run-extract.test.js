import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { runExtract } from '../../../src/core/run-extract.js';

test('runExtract - mock mode', async () => {
  const result = await runExtract({ workspace: '.', mock: true });

  assert.ok(result.ok);
  assert.equal(result.mock, true);
  assert.ok(result.input, 'should have input path');
  assert.ok(result.output, 'should have output path');
});

test('runExtract with isolated preset reads from examples/, writes to isolated', async () => {
  try {
    const result = await runExtract({
      workspace: '.',
      preset: 'isolated',
      mock: true
    });
    assert.equal(result.ok, true);
    assert.match(result.input, /^examples\/pipeline/);
    assert.match(result.output, /^\.prunemem-isolated\/pipeline/);
  } finally {
    if (existsSync('.prunemem-isolated')) {
      rmSync('.prunemem-isolated', { recursive: true, force: true });
    }
  }
});
