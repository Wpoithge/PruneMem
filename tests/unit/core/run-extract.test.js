import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExtract } from '../../../src/core/run-extract.js';

test('runExtract - mock mode', async () => {
  const result = await runExtract({ workspace: '.', mock: true });

  assert.ok(result.ok);
  assert.equal(result.mock, true);
  assert.ok(result.input, 'should have input path');
  assert.ok(result.output, 'should have output path');
});
