import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeContext } from '../../../src/core/build-runtime-context.js';
import { compareGolden } from '../../helpers/golden-diff.js';

test('buildRuntimeContext - happy path with default workspace', async () => {
  const result = await buildRuntimeContext({ workspace: '.' });

  assert.ok(result.ok);
  assert.ok(result.runtimeContext, 'should have runtimeContext');
  assert.ok(result.bundle, 'should have bundle');
});

test('buildRuntimeContext - golden diff matches (masked)', async () => {
  const result = await buildRuntimeContext({ workspace: '.' });
  const comparison = await compareGolden(
    JSON.stringify(result),
    'tests/golden/build-runtime-context.json'
  );

  assert.ok(comparison.equal, comparison.diff || 'Golden diff should match after masking');
});
