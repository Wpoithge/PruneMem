import { SCHEMA_VERSIONS } from '../lib/schema.js';
import { sanitizeText, uniqStrings } from '../working/state.js';

function nowIso() {
  return new Date().toISOString();
}

export function createExecutionPlan(input = {}) {
  const milestones = Array.isArray(input.milestones)
    ? input.milestones.map((item, index) => ({
      id: item.id || `m${index + 1}`,
      title: sanitizeText(item.title || `Milestone ${index + 1}`) || `Milestone ${index + 1}`,
      status: item.status || (index === 0 ? 'in_progress' : 'pending'),
      notes: sanitizeText(item.notes) || null,
      updated_at: item.updated_at || nowIso(),
    }))
    : [];

  return {
    schema_version: SCHEMA_VERSIONS.executionPlan,
    memory_version: 'v4.1',
    session_key: input.session_key || 'unknown',
    plan_title: sanitizeText(input.plan_title || input.task_title || 'Execution plan') || 'Execution plan',
    goal: sanitizeText(input.goal) || null,
    status: input.status || 'active',
    reporting_policy: {
      report_on_milestone: input.reporting_policy?.report_on_milestone ?? true,
      report_every_minutes_without_milestone: Number(input.reporting_policy?.report_every_minutes_without_milestone ?? 10),
      continue_after_interim_report: input.reporting_policy?.continue_after_interim_report ?? true,
    },
    milestones,
    created_at: input.created_at || nowIso(),
    updated_at: input.updated_at || nowIso(),
    last_reported_at: input.last_reported_at || null,
  };
}

export function deriveMilestoneState(plan = {}) {
  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
  const current = milestones.find((item) => item.status === 'in_progress') || null;
  const doneCount = milestones.filter((item) => item.status === 'done').length;
  return {
    schema_version: SCHEMA_VERSIONS.milestoneState,
    memory_version: 'v4.1',
    session_key: plan.session_key || 'unknown',
    current_milestone_id: current?.id || null,
    current_milestone_title: current?.title || null,
    completed_milestone_ids: uniqStrings(milestones.filter((item) => item.status === 'done').map((item) => item.id)),
    status: current ? 'in_progress' : (milestones.length && doneCount === milestones.length ? 'done' : 'idle'),
    updated_at: nowIso(),
  };
}

export function buildExecutionContext(plan = {}, milestoneState = null) {
  const normalizedPlan = createExecutionPlan(plan);
  const milestone = milestoneState || deriveMilestoneState(normalizedPlan);
  const current = normalizedPlan.milestones.find((item) => item.id === milestone.current_milestone_id) || null;
  const pending = normalizedPlan.milestones.filter((item) => item.status === 'pending').map((item) => item.title);
  const completed = normalizedPlan.milestones.filter((item) => item.status === 'done').map((item) => item.title);

  return {
    schema_version: SCHEMA_VERSIONS.runtimeContext,
    memory_version: 'v4.1',
    session_key: normalizedPlan.session_key,
    generated_at: nowIso(),
    content: [
      '[Execution Plan]',
      normalizedPlan.plan_title,
      normalizedPlan.goal ? `Goal: ${normalizedPlan.goal}` : null,
      current ? `Current milestone: ${current.title}` : 'Current milestone: none',
      completed.length ? `Completed milestones: ${completed.join(' | ')}` : null,
      pending.length ? `Pending milestones: ${pending.join(' | ')}` : null,
      `Interim report cadence: every ${normalizedPlan.reporting_policy.report_every_minutes_without_milestone} minutes`,
    ].filter(Boolean).join('\n'),
    plan: normalizedPlan,
    milestone_state: milestone,
  };
}
