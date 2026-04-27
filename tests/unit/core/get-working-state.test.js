import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWorkingState } from '../../../src/core/get-working-state.js';

test('getWorkingState - happy path with default workspace', async () => {
  const result = await getWorkingState({ workspace: '.' });

  assert.ok(result, 'should return working state');
  assert.equal(result.schema_version, 'prunemem.working-state.v1');
  assert.ok(result.session_key, 'should have session_key');
});
