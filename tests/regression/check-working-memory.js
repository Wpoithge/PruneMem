#!/usr/bin/env node
import process from 'node:process';
import { buildRuntimeContextFromWorkingState, defaultWorkingState, mergeWorkingState } from '../../src/working/state.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function main() {
  const base = defaultWorkingState({
    memory_version: 'v4.1',
    session_key: 'agent:test:main',
    task_title: 'Test working memory',
    user_request_summary: 'Ship the release safely.',
    in_progress_steps: ['Write docs'],
  });
  const next = mergeWorkingState(base, {
    completed_steps_added: ['Write docs'],
    next_actions_set: ['Run checks'],
    blocked_items_set: [],
    constraints_added: ['Do not leak secrets.'],
  }, { clearCompletedFromInProgress: true });
  const runtime = buildRuntimeContextFromWorkingState(next, { memoryVersion: 'v4.1' });

  assert(next.completed_steps.includes('Write docs'), 'completed step recorded');
  assert(!next.in_progress_steps.includes('Write docs'), 'completed step removed from in-progress');
  assert(next.next_actions.length === 1 && next.next_actions[0] === 'Run checks', 'next actions replaced');
  assert(runtime.content.includes('Run checks'), 'runtime context includes next actions');
  assert(runtime.memory_version === 'v4.1', 'runtime context keeps v4.1 version');

  process.stdout.write(JSON.stringify({ ok: true, next, runtime }, null, 2) + '\n');
}

main();
