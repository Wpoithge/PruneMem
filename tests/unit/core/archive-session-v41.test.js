import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveSessionV41 } from '../../../src/core/archive-session-v41.js';
import { compareGolden } from '../../helpers/golden-diff.js';

test('archiveSessionV41 - happy path with default workspace', async () => {
  const result = await archiveSessionV41({ workspace: '.' });

  assert.ok(result.ok, 'result should have ok: true');
  assert.ok(result.archive, 'result should have archive object');
  assert.equal(result.archive.memory_version, 'v4.1', 'memory version should be v4.1');
  assert.equal(result.archive.schema_version, 'prunemem.session-archive.v1', 'schema version should match');
  assert.ok(result.archive.archive_id, 'archive should have an ID');
  assert.ok(result.archive.archived_at, 'archive should have timestamp');
  assert.ok(result.archive.working_state_snapshot, 'archive should have working state');
  assert.ok(result.archive.runtime_context_snapshot, 'archive should have runtime context');
});

test('archiveSessionV41 - can specify custom memory version', async () => {
  const result = await archiveSessionV41({ workspace: '.', memoryVersion: 'v4.0' });

  assert.ok(result.ok);
  assert.equal(result.archive.memory_version, 'v4.0', 'should use custom memory version');
});

test('archiveSessionV41 - golden diff matches (masked)', async () => {
  const result = await archiveSessionV41({ workspace: '.' });
  const comparison = await compareGolden(
    JSON.stringify(result),
    'tests/golden/archive-session-v41.json'
  );

  assert.ok(comparison.equal, comparison.diff || 'Golden diff should match after masking timestamps');
});
