import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionPlan } from '../../../src/core/execution-plan.js';
import { compareGolden } from '../../helpers/golden-diff.js';

test('executionPlan - happy path with default workspace', async () => {
  const result = await executionPlan({ workspace: '.' });

  assert.ok(result.ok);
  assert.ok(result.plan, 'should have plan');
  assert.ok(result.milestoneState, 'should have milestoneState');
  assert.ok(result.executionContext, 'should have executionContext');
});

test('executionPlan - golden diff matches (masked)', async () => {
  const result = await executionPlan({ workspace: '.' });
  const comparison = await compareGolden(
    JSON.stringify(result),
    'tests/golden/execution-plan.json'
  );

  assert.ok(comparison.equal, comparison.diff || 'Golden diff should match after masking');
});
