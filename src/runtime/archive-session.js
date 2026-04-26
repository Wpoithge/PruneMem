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

/**
 * Archive a session packet with working state into a session archive.
 *
 * @param {object} options
 * @param {object} options.packet - session packet to archive
 * @param {object} [options.workingState] - working state snapshot
 * @param {object} [options.runtimeContext] - runtime context (auto-built if not provided)
 * @param {string} [options.memoryVersion='v4.1'] - memory version
 * @param {string} [options.archiveId] - custom archive ID
 * @param {string} [options.archivedAt] - custom archive timestamp
 * @param {string} [options.title] - custom title
 * @param {number} [options.recentMessagesLimit=6] - number of recent messages to include
 * @returns {Promise<object>} session archive object
 */
export async function archiveSession({
  packet = {},
  workingState: providedWorkingState,
  runtimeContext: providedRuntimeContext,
  memoryVersion = 'v4.1',
  archiveId,
  archivedAt,
  title,
  recentMessagesLimit = 6,
} = {}) {
  const workingState = providedWorkingState || defaultWorkingState({
    session_key: packet.session_key,
    channel: packet.channel,
    agent: packet.agent,
  });
  const runtimeContext = providedRuntimeContext || buildRuntimeContextFromWorkingState(workingState, {
    memoryVersion: memoryVersion || workingState.memory_version,
  });
  const messages = Array.isArray(packet.messages) ? packet.messages.map(sanitizeMessage) : [];
  const finalArchiveId = archiveId || `${packet.session_key || 'session'}:${packet.trigger || 'archive'}:${(packet.ended_at || nowIso()).replace(/[^0-9TZ:-]/g, '')}`;

  return {
    schema_version: SCHEMA_VERSIONS.sessionArchive,
    memory_version: memoryVersion,
    archive_id: finalArchiveId,
    archived_at: archivedAt || nowIso(),
    source_session_packet_version: packet.schema_version || null,
    session_key: packet.session_key || 'unknown',
    channel: packet.channel ?? null,
    agent: packet.agent ?? null,
    trigger: packet.trigger || 'manual-archive',
    summary: {
      title: title || workingState.task_title,
      message_count: messages.length,
      first_user_message: messages.find((item) => item.role === 'user')?.text || null,
      last_assistant_message: [...messages].reverse().find((item) => item.role === 'assistant')?.text || null,
    },
    transcript_excerpt: messages.slice(-recentMessagesLimit),
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
