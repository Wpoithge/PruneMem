#!/usr/bin/env node
import process from 'node:process';
import { archiveSession } from '../../src/runtime/archive-session.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function main() {
  const archive = await archiveSession({
    schema_version: 'prunemem.session-packet.v1',
    session_key: 'agent:test:main',
    channel: 'webchat',
    agent: 'test',
    trigger: 'command:reset',
    ended_at: '2026-04-12T00:00:00.000Z',
    messages: [
      { role: 'user', text: 'Please finish the release.' },
      { role: 'assistant', text: 'I will update the docs and run checks.' },
    ],
  }, {
    memoryVersion: 'v4.1',
    workingState: {
      memory_version: 'v4.1',
      session_key: 'agent:test:main',
      task_title: 'Ship release',
      candidate_long_term_memories: [{ canonical_summary: 'Keep public boundaries explicit.' }],
      related_archives: ['archive:test-001'],
    },
  });

  assert(archive.memory_version === 'v4.1', 'archive version is v4.1');
  assert(archive.working_state_snapshot.task_title === 'Ship release', 'working-state snapshot included');
  assert(archive.runtime_context_snapshot.content.includes('Ship release'), 'runtime context snapshot included');
  assert(archive.session_relationship.archive_role === 'closed-session-snapshot', 'archive relationship captured');

  process.stdout.write(JSON.stringify({ ok: true, archive }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-session-archive] failed:', err);
  process.exit(1);
});
