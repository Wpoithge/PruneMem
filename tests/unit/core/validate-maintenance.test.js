import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMaintenance } from '../../../src/core/validate-maintenance.js';

test('validateMaintenance - basic execution with default workspace', async () => {
  const result = await validateMaintenance({ workspace: '.' });

  assert.equal(typeof result.ok, 'boolean');
  assert.ok(result.counts, 'should have counts object');
  assert.ok(result.paths, 'should have paths object');
});

test('validateMaintenance - strict mode flag passes through', async () => {
  const result = await validateMaintenance({ workspace: '.', strict: true });

  assert.equal(result.strict, true);
});

test('validateMaintenance with custom preset memoryMd=null skips MEMORY.md checks', async () => {
  const result = await validateMaintenance({
    workspace: '.',
    preset: 'custom',
    override: { memoryMd: null }
  });

  assert.equal(result.ok, true);
  assert.equal(result.paths.memory_md, null);
  assert.equal(result.counts.duplicate_memory_bullets, 0);
});

test('validateMaintenance with isolated preset returns examples/ in paths field', async () => {
  const result = await validateMaintenance({
    workspace: '.',
    preset: 'isolated'
  });

  assert.equal(result.paths.registry, 'examples/registry');
  assert.equal(result.paths.pipeline, 'examples/pipeline');
});
