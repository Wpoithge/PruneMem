import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateWorkingState } from '../../../src/core/update-working-state.js';
import { compareGolden } from '../../helpers/golden-diff.js';

test('updateWorkingState - happy path with default workspace', async () => {
  const result = await updateWorkingState({ workspace: '.' });

  assert.ok(result.ok);
  assert.ok(result.state, 'should have state');
  assert.ok(result.event, 'should have event');
  assert.ok(result.runtimeContext, 'should have runtimeContext');
});

test('updateWorkingState - golden diff matches (masked)', async () => {
  const result = await updateWorkingState({ workspace: '.' });
  const comparison = await compareGolden(
    JSON.stringify(result),
    'tests/golden/update-working-state.json'
  );

  assert.ok(comparison.equal, comparison.diff || 'Golden diff should match after masking');
});

test('updateWorkingState with isolated preset reads from examples/, would write to isolated', async () => {
  const result = await updateWorkingState({
    workspace: '.',
    preset: 'isolated',
    write: false
  });
  assert.equal(result.ok, true);
  assert.equal(result.written, false);
});
