import { updateRegistries } from '../../core/update-registries.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_update_registries';

export const description =
  'Insert judged facts into the registry (memories, lifecycle, topics, dedupe). ' +
  'If write is true, writes registry files to disk. Defaults to false (dry-run). ' +
  'This default matches PruneMem\'s D5 dry-run convention: write-class tools require ' +
  'explicit opt-in to mutate disk.';

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    judged: {
      type: 'string',
      description:
        'Absolute or relative path to judged facts JSON. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    sourcePaths: {
      type: 'string',
      description:
        'Absolute or relative path to source-paths JSON (apply output). ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    memoryId: {
      type: 'string',
      description: 'Memory ID to assign. Defaults to the judged file\'s memory_id.',
    },
    channel: {
      type: 'string',
      description: 'Channel identifier. Defaults to "demo".',
    },
    agent: {
      type: 'string',
      description: 'Agent identifier. Defaults to "demo".',
    },
    write: {
      type: 'boolean',
      description:
        'If true, writes registry files to disk. Defaults to false (dry-run). ' +
        'This default matches PruneMem\'s D5 dry-run convention: write-class tools require ' +
        'explicit opt-in to mutate disk.',
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
  judged: 'judged',
  sourcePaths: 'sourcePaths',
  memoryId: 'memoryId',
  channel: 'channel',
  agent: 'agent',
  write: 'write',
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
    const result = await updateRegistries(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
