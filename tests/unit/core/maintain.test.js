import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maintain } from '../../../src/core/maintain.js';
import { compareGolden } from '../../helpers/golden-diff.js';

test('maintain - happy path with default workspace', async () => {
  const result = await maintain({ workspace: '.' });

  assert.ok(result.ok, 'result should have ok: true');
  assert.ok(result.summary, 'result should have summary');
  assert.equal(typeof result.summary.steps_total, 'number');
  assert.ok(Array.isArray(result.steps), 'steps should be an array');
  assert.ok(result.steps.length > 0, 'should have run at least one step');
});

test('maintain - golden diff matches (masked)', async () => {
  const result = await maintain({ workspace: '.' });
  const comparison = await compareGolden(
    JSON.stringify(result),
    'tests/golden/maintain.json'
  );

  assert.ok(comparison.equal, comparison.diff || 'Golden diff should match after masking');
});
