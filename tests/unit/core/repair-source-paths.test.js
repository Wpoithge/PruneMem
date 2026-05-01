import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairSourcePaths } from '../../../src/core/repair-source-paths.js';

test('repairSourcePaths - happy path with default workspace', async () => {
  const result = await repairSourcePaths({ workspace: '.' });

  assert.ok(result.ok);
  assert.equal(typeof result.repaired, 'number');
  assert.ok(Array.isArray(result.actions));
});

test('repairSourcePaths with isolated preset does not throw', async () => {
  const result = await repairSourcePaths({
    workspace: '.',
    preset: 'isolated'
  });
  assert.equal(result.ok, true);
});
