import { SCHEMA_VERSIONS } from './schema.js';

function fail(kind, message, details = {}) {
  const err = new Error(message);
  err.name = 'InputValidationError';
  err.kind = kind;
  err.details = details;
  throw err;
}

export function validateSessionPacket(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('session-packet', 'session packet input must be an object');
  }
  if (input.schema_version !== SCHEMA_VERSIONS.sessionPacket) {
    fail('session-packet', `session packet schema_version must be ${SCHEMA_VERSIONS.sessionPacket}`, { received: input.schema_version || null });
  }
  for (const field of ['memory_id', 'session_key', 'channel', 'agent']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      fail('session-packet', `session packet field ${field} must be a non-empty string`);
    }
  }
  return input;
}

export function validateExtractedFacts(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('extracted-facts', 'extracted facts input must be an object');
  }
  if (input.schema_version && input.schema_version !== 'prunemem.extracted.v1') {
    fail('extracted-facts', 'extracted facts schema_version must be prunemem.extracted.v1', { received: input.schema_version });
  }
  if (typeof input.memory_id !== 'string' || !input.memory_id.trim()) {
    fail('extracted-facts', 'extracted facts memory_id must be a non-empty string');
  }
  if (!Array.isArray(input.facts)) {
    fail('extracted-facts', 'extracted facts must include a facts array');
  }
  for (const [index, fact] of input.facts.entries()) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
      fail('extracted-facts', `facts[${index}] must be an object`);
    }
    for (const field of ['fact_id', 'fact_type', 'text']) {
      if (typeof fact[field] !== 'string' || !fact[field].trim()) {
        fail('extracted-facts', `facts[${index}].${field} must be a non-empty string`);
      }
    }
  }
  return input;
}
