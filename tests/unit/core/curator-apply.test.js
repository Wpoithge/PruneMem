import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curatorApply } from '../../../src/core/curator-apply.js';

test('curatorApply - happy path with default workspace', async () => {
  const result = await curatorApply({ workspace: '.' });

  assert.ok(result.ok, 'result should have ok: true');
  assert.equal(result.write, false, 'write should default to false');
  assert.ok(Array.isArray(result.actions), 'actions should be an array');
  assert.ok(Array.isArray(result.dry_run_candidates), 'dry_run_candidates should be an array');
  assert.ok(result.summary, 'result should have summary');
  assert.equal(typeof result.summary.applied, 'number', 'summary.applied should be a number');
});

test('curatorApply - write mode enabled', async () => {
  const result = await curatorApply({ workspace: '.', write: true });

  assert.ok(result.ok);
  assert.equal(result.write, true, 'write should be true when enabled');
});

test('curatorApply - respects limit parameter', async () => {
  const result = await curatorApply({ workspace: '.', limit: 5 });

  assert.ok(result.ok);
  assert.ok(result.actions.length <= 5, 'actions should respect limit');
  assert.ok(result.dry_run_candidates.length <= 5, 'dry_run_candidates should respect limit');
});
