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
