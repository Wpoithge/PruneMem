import { SCHEMA_VERSIONS } from '../lib/schema.js';
import { buildRuntimeContextFromWorkingState, defaultWorkingState } from '../working/state.js';

function nowIso() {
  return new Date().toISOString();
}

function sanitizeMessage(message = {}, index = 0) {
  return {
    idx: message.idx ?? index + 1,
    role: message.role || 'unknown',
    text: String(message.text || '').trim(),
    ts: message.ts || null,
  };
}

export async function archiveSession(packet = {}, options = {}) {
  const workingState = defaultWorkingState({
    session_key: packet.session_key,
    channel: packet.channel,
    agent: packet.agent,
    ...(options.workingState || {}),
  });
  const runtimeContext = options.runtimeContext || buildRuntimeContextFromWorkingState(workingState, {
    memoryVersion: options.memoryVersion || workingState.memory_version,
  });
  const messages = Array.isArray(packet.messages) ? packet.messages.map(sanitizeMessage) : [];
  const archiveId = options.archiveId || `${packet.session_key || 'session'}:${packet.trigger || 'archive'}:${(packet.ended_at || nowIso()).replace(/[^0-9TZ:-]/g, '')}`;

  return {
    schema_version: SCHEMA_VERSIONS.sessionArchive,
    memory_version: options.memoryVersion || 'v4.1',
    archive_id: archiveId,
    archived_at: options.archivedAt || nowIso(),
    source_session_packet_version: packet.schema_version || null,
    session_key: packet.session_key || 'unknown',
    channel: packet.channel ?? null,
    agent: packet.agent ?? null,
    trigger: packet.trigger || 'manual-archive',
    summary: {
      title: options.title || workingState.task_title,
      message_count: messages.length,
      first_user_message: messages.find((item) => item.role === 'user')?.text || null,
      last_assistant_message: [...messages].reverse().find((item) => item.role === 'assistant')?.text || null,
    },
    transcript_excerpt: messages.slice(-(options.recentMessagesLimit || 6)),
    working_state_snapshot: workingState,
    runtime_context_snapshot: runtimeContext,
    candidate_long_term_memories: workingState.candidate_long_term_memories,
    related_archives: workingState.related_archives,
    session_relationship: {
      source_session_key: packet.session_key || 'unknown',
      archive_role: 'closed-session-snapshot',
      long_term_memory_role: 'candidate-source',
      runtime_context_role: 'resume-and-audit',
    },
  };
}
