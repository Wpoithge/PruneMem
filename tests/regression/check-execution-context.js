#!/usr/bin/env node
import process from 'node:process';
import { buildExecutionContext, createExecutionPlan, deriveMilestoneState } from '../../src/runtime/execution-context.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function main() {
  const plan = createExecutionPlan({
    session_key: 'agent:test:main',
    plan_title: 'Release plan',
    goal: 'Ship v4.1 safely.',
    milestones: [
      { id: 'm1', title: 'Audit', status: 'done' },
      { id: 'm2', title: 'Implement', status: 'in_progress' },
      { id: 'm3', title: 'Check', status: 'pending' },
    ],
    reporting_policy: { report_every_minutes_without_milestone: 12 },
  });
  const milestoneState = deriveMilestoneState(plan);
  const executionContext = buildExecutionContext(plan, milestoneState);

  assert(milestoneState.current_milestone_id === 'm2', 'current milestone derived');
  assert(milestoneState.completed_milestone_ids.includes('m1'), 'completed milestone tracked');
  assert(executionContext.content.includes('Interim report cadence: every 12 minutes'), 'report cadence rendered');
  assert(executionContext.memory_version === 'v4.1', 'execution context version is v4.1');

  process.stdout.write(JSON.stringify({ ok: true, plan, milestoneState, executionContext }, null, 2) + '\n');
}

main();
