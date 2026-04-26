import { SCHEMA_VERSIONS } from '../lib/schema.js';

function nowIso() {
  return new Date().toISOString();
}

export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function uniqStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(sanitizeText).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function mergeStringLists(base = [], added = [], reset = null) {
  if (Array.isArray(reset)) return uniqStrings(reset);
  return uniqStrings([...(Array.isArray(base) ? base : []), ...(Array.isArray(added) ? added : [])]);
}

export function defaultWorkingState(seed = {}) {
  return {
    schema_version: SCHEMA_VERSIONS.workingState,
    memory_version: seed.memory_version || 'v4',
    session_key: seed.session_key || 'unknown',
    channel: seed.channel ?? null,
    agent: seed.agent ?? null,
    status: seed.status || 'active',
    task_title: sanitizeText(seed.task_title || seed.user_request_summary || 'Unnamed task') || 'Unnamed task',
    goal: sanitizeText(seed.goal || seed.user_request_summary || 'Keep task continuity and expose progress clearly.') || null,
    user_request_summary: sanitizeText(seed.user_request_summary) || null,
    constraints: uniqStrings(seed.constraints || []),
    decisions_confirmed: uniqStrings(seed.decisions_confirmed || []),
    open_questions: uniqStrings(seed.open_questions || []),
    next_actions: uniqStrings(seed.next_actions || []),
    completed_steps: uniqStrings(seed.completed_steps || []),
    in_progress_steps: uniqStrings(seed.in_progress_steps || []),
    blocked_items: uniqStrings(seed.blocked_items || []),
    artifacts: Array.isArray(seed.artifacts) ? seed.artifacts : [],
    candidate_long_term_memories: Array.isArray(seed.candidate_long_term_memories) ? seed.candidate_long_term_memories : [],
    last_user_intent: sanitizeText(seed.last_user_intent) || null,
    last_agent_action_summary: sanitizeText(seed.last_agent_action_summary) || null,
    source_sessions: uniqStrings(seed.source_sessions || (seed.session_key ? [seed.session_key] : [])),
    related_archives: uniqStrings(seed.related_archives || []),
    created_at: seed.created_at || nowIso(),
    updated_at: seed.updated_at || nowIso(),
  };
}

export function mergeWorkingState(current = {}, delta = {}, policy = {}) {
  const base = defaultWorkingState(current);
  const next = {
    ...base,
    memory_version: delta.memory_version || current.memory_version || base.memory_version || 'v4',
    channel: delta.channel ?? base.channel,
    agent: delta.agent ?? base.agent,
    status: delta.status || base.status,
    task_title: sanitizeText(delta.task_title || base.task_title) || base.task_title,
    goal: sanitizeText(delta.goal || base.goal) || base.goal,
    user_request_summary: sanitizeText(delta.user_request_summary ?? base.user_request_summary) || null,
    constraints: mergeStringLists(base.constraints, delta.constraints_added, delta.constraints_set),
    decisions_confirmed: mergeStringLists(base.decisions_confirmed, delta.decisions_confirmed_added, delta.decisions_confirmed_set),
    open_questions: mergeStringLists(base.open_questions, delta.open_questions_added, delta.open_questions_set),
    next_actions: mergeStringLists(base.next_actions, delta.next_actions_added, delta.next_actions_set),
    completed_steps: mergeStringLists(base.completed_steps, delta.completed_steps_added, delta.completed_steps_set),
    in_progress_steps: mergeStringLists(base.in_progress_steps, delta.in_progress_steps_added, delta.in_progress_steps_set),
    blocked_items: mergeStringLists(base.blocked_items, delta.blocked_items_added, delta.blocked_items_set),
    artifacts: Array.isArray(delta.artifacts_set) ? delta.artifacts_set : (Array.isArray(delta.artifacts_added) ? [...base.artifacts, ...delta.artifacts_added] : base.artifacts),
    candidate_long_term_memories: Array.isArray(delta.candidate_long_term_memories_set)
      ? delta.candidate_long_term_memories_set
      : (Array.isArray(delta.candidate_long_term_memories_added)
        ? [...base.candidate_long_term_memories, ...delta.candidate_long_term_memories_added]
        : base.candidate_long_term_memories),
    last_user_intent: Object.prototype.hasOwnProperty.call(delta, 'last_user_intent')
      ? sanitizeText(delta.last_user_intent) || null
      : base.last_user_intent,
    last_agent_action_summary: Object.prototype.hasOwnProperty.call(delta, 'last_agent_action_summary')
      ? sanitizeText(delta.last_agent_action_summary) || null
      : base.last_agent_action_summary,
    source_sessions: mergeStringLists(base.source_sessions, delta.source_sessions_added, delta.source_sessions_set),
    related_archives: mergeStringLists(base.related_archives, delta.related_archives_added, delta.related_archives_set),
    updated_at: nowIso(),
  };

  if (policy.clearCompletedFromInProgress !== false && next.completed_steps.length) {
    const done = new Set(next.completed_steps);
    next.in_progress_steps = next.in_progress_steps.filter((item) => !done.has(item));
  }

  if (policy.clearResolvedQuestions !== false && next.decisions_confirmed.length && next.open_questions.length) {
    const resolved = new Set(next.decisions_confirmed.map((item) => item.toLowerCase()));
    next.open_questions = next.open_questions.filter((item) => !resolved.has(item.toLowerCase()));
  }

  return next;
}

export function buildWorkingEvent({ sessionKey, trigger, summary, stateDelta, stateVersion = 'v4' } = {}) {
  return {
    schema_version: SCHEMA_VERSIONS.workingEvent,
    memory_version: stateVersion,
    session_key: sessionKey || 'unknown',
    trigger: trigger || 'manual:update',
    summary: sanitizeText(summary).slice(0, 200) || null,
    state_delta: stateDelta || {},
    recorded_at: nowIso(),
  };
}

function lines(title, values = []) {
  if (!values.length) return null;
  return [`${title}:`, ...values.map((value) => `- ${value}`)].join('\n');
}

export function buildRuntimeContextFromWorkingState(state = {}, options = {}) {
  const working = defaultWorkingState(state);
  const sections = [
    working.task_title ? `[Task]\n${working.task_title}` : null,
    working.goal ? `[Goal]\n${working.goal}` : null,
    working.user_request_summary ? `[User Request]\n${working.user_request_summary}` : null,
    working.last_user_intent ? `[Last User Intent]\n${working.last_user_intent}` : null,
    lines('[Constraints]', working.constraints),
    lines('[Decisions Confirmed]', working.decisions_confirmed),
    lines('[In Progress]', working.in_progress_steps),
    lines('[Next Actions]', working.next_actions),
    lines('[Blocked]', working.blocked_items),
    lines('[Open Questions]', working.open_questions),
    lines('[Completed]', working.completed_steps),
    working.last_agent_action_summary ? `[Last Agent Action]\n${working.last_agent_action_summary}` : null,
  ].filter(Boolean);

  const content = sections.join('\n\n').trim();
  const maxChars = Number(options.maxChars || 1600);
  return {
    schema_version: SCHEMA_VERSIONS.runtimeContext,
    memory_version: options.memoryVersion || (working.memory_version === 'v4.1' ? 'v4.1' : 'v4'),
    session_key: working.session_key,
    status: working.status,
    generated_at: nowIso(),
    content: content.length > maxChars ? `${content.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...` : content,
  };
}

export function buildContextBundle({ workingState = {}, runtimeContext = null, longTermMemory = [], archiveRefs = [], executionContext = null } = {}) {
  const working = defaultWorkingState(workingState);
  const runtime = runtimeContext || buildRuntimeContextFromWorkingState(working, { memoryVersion: working.memory_version });
  return {
    schema_version: SCHEMA_VERSIONS.contextBundle,
    memory_version: working.memory_version === 'v4.1' ? 'v4.1' : 'v4',
    session_key: working.session_key,
    generated_at: nowIso(),
    working_state: working,
    runtime_context: runtime,
    execution_context: executionContext,
    long_term_memory: Array.isArray(longTermMemory) ? longTermMemory : [],
    archive_refs: Array.isArray(archiveRefs) ? archiveRefs : [],
  };
}
