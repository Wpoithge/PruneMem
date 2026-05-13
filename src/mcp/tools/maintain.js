import { maintain } from '../../core/maintain.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_maintain';

export const description =
  'Run maintenance pipeline: validate registry consistency, optionally repair source paths, ' +
  'optionally enforce strict mode. If write is true, persists any repair actions to disk. ' +
  'Defaults to false (dry-run). ' +
  'This default matches PruneMem\'s D5 dry-run convention: ' +
  'write-class tools require explicit opt-in to mutate disk.';

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    write: {
      type: 'boolean',
      description:
        'If true, persists any repair actions to disk. Defaults to false (dry-run). ' +
        'This default matches PruneMem\'s D5 dry-run convention: write-class tools require ' +
        'explicit opt-in to mutate disk.',
    },
    strict: {
      type: 'boolean',
      description: 'Enforce strict validation. Defaults to false.',
    },
    repairSourcePaths: {
      type: 'boolean',
      description: 'Repair missing source-path references before final validation. Defaults to false.',
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
  write: 'write',
  strict: 'strict',
  repairSourcePaths: 'repairSourcePaths',
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
    const result = await maintain(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
