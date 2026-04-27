import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runJudge } from '../../../src/core/run-judge.js';

test('runJudge - mock mode', async () => {
  const result = await runJudge({ workspace: '.', mock: true });

  assert.ok(result.ok);
  assert.equal(result.mock, true);
  assert.ok(result.input, 'should have input path');
  assert.ok(result.output, 'should have output path');
});
