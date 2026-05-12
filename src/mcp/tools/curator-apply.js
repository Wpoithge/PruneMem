import { curatorApply } from '../../core/curator-apply.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_curator_apply';

export const description =
  'Apply curator rules: merge, expire, normalize topic/dedupe pointers, and detect dry-run candidates. ' +
  'If write is true, persists actions to registry. Defaults to false (dry-run). ' +
  'This default matches PruneMem\'s D5 dry-run convention: write-class tools require ' +
  'explicit opt-in to mutate disk.';

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
        'If true, persists actions to registry. Defaults to false (dry-run). ' +
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
    const result = await curatorApply(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
