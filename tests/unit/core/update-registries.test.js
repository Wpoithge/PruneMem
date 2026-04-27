import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateRegistries } from '../../../src/core/update-registries.js';

test('updateRegistries - basic execution with workspace', async () => {
  const result = await updateRegistries({ workspace: '.' });

  assert.ok(result.ok);
  assert.equal(typeof result.inserted, 'number');
  assert.ok(result.files, 'should have files object');
  assert.ok(result.files.topics, 'should have topics path');
  assert.ok(result.files.dedupe, 'should have dedupe path');
  assert.ok(result.files.lifecycle, 'should have lifecycle path');
  assert.ok(result.files.memories, 'should have memories path');
});
