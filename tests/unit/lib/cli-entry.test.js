import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMainModule } from '../../../src/lib/cli-entry.js';

test('isMainModule returns false for a module that is not argv[1]', () => {
  // Simulate a core module URL that is not the script being run.
  const otherModule = 'file:///Users/yang/Desktop/PruneMem/src/core/update-registries.js';
  assert.equal(isMainModule(otherModule), false);
});

test('isMainModule returns true when module path matches argv[1]', () => {
  // When node --test runs this file, argv[1] is this file's path.
  assert.equal(isMainModule(import.meta.url), true);
});
