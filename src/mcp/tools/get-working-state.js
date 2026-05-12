import { getWorkingState } from '../../core/get-working-state.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_get_working_state';

export const description =
  'Read and return the parsed working-state JSON from a workspace. ' +
  'Pure read; no disk writes.';

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    input: {
      type: 'string',
      description:
        'Absolute or relative path to working-state JSON. ' +
        'If omitted, the core function resolves a workspace-relative default.',
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
  input: 'input',
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
    const result = await getWorkingState(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
