import { archiveSessionV41 } from '../../core/archive-session-v41.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_archive_session';

export const description =
  'Archive a session from a workspace into a structured V4.1 session packet. ' +
  'Returns the archive object without writing to disk (compute-only).';

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    packet: {
      type: 'string',
      description:
        'Absolute or relative path to session-packet.json. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    state: {
      type: 'string',
      description:
        'Absolute or relative path to working-state.json. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    memory_version: {
      type: 'string',
      description: 'Memory schema version. Defaults to "v4.1".',
    },
    preset: {
      type: 'string',
      description: 'Path preset: "default", "isolated", or "custom". Defaults to "default".',
    },
    override: {
      type: 'object',
      description: 'Partial path override object. Shallow-merged into preset base.',
    },
  },
  additionalProperties: false,
};

const ARG_MAP = {
  workspace: 'workspace',
  packet: 'packet',
  state: 'state',
  memory_version: 'memoryVersion',
  preset: 'preset',
  override: 'override',
};

/**
 * @param {Record<string, unknown>} args
 */
export async function handler(args) {
  const params = {};
  for (const [mcpKey, libKey] of Object.entries(ARG_MAP)) {
    if (args[mcpKey] !== undefined) {
      params[libKey] = args[mcpKey];
    }
  }

  try {
    const result = await archiveSessionV41(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
