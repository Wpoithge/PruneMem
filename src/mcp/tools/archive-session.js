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

/**
 * @param {Record<string, unknown>} args
 */
export async function handler(args) {
  try {
    const params = {};
    if (args.workspace !== undefined) {
      if (typeof args.workspace !== 'string') {
        throw new TypeError('workspace must be a string');
      }
      params.workspace = args.workspace;
    }
    if (args.packet !== undefined) {
      if (typeof args.packet !== 'string') {
        throw new TypeError('packet must be a string');
      }
      params.packet = args.packet;
    }
    if (args.state !== undefined) {
      if (typeof args.state !== 'string') {
        throw new TypeError('state must be a string');
      }
      params.state = args.state;
    }
    if (args.memory_version !== undefined) {
      if (typeof args.memory_version !== 'string') {
        throw new TypeError('memory_version must be a string');
      }
      params.memoryVersion = args.memory_version;
    }
    if (args.preset !== undefined) {
      if (typeof args.preset !== 'string') {
        throw new TypeError('preset must be a string');
      }
      params.preset = args.preset;
    }
    if (args.override !== undefined) {
      if (typeof args.override !== 'object' || args.override === null) {
        throw new TypeError('override must be an object');
      }
      params.override = args.override;
    }

    const result = await archiveSessionV41(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
