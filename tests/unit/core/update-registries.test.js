import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateRegistries } from '../../../src/core/update-registries.js';

test('updateRegistries default does not write (dry-run)', async () => {
  const result = await updateRegistries({ workspace: '.' });
  assert.equal(result.ok, true);
  assert.equal(result.write, false);
  assert.equal(typeof result.inserted, 'number');
});

test('updateRegistries returns files map regardless of write flag', async () => {
  const result = await updateRegistries({ workspace: '.' });
  assert.ok(result.files);
  assert.match(result.files.memories, /memories\.jsonl$/);
  assert.match(result.files.topics, /topics\.jsonl$/);
});

test('updateRegistries with isolated preset does not touch examples/', async () => {
  const result = await updateRegistries({
    workspace: '.',
    preset: 'isolated',
    write: false,
  });
  assert.equal(result.ok, true);
  assert.match(result.files.memories, /\.prunemem-isolated.*memories\.jsonl$/);
});
