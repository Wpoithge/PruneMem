import { updateWorkingState } from '../../core/update-working-state.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_update_working_state';

export const description =
  'Read working-state update input, merge into current state, and produce next state + runtime context. ' +
  'If write is true, writes the updated state to disk. Defaults to false (dry-run). ' +
  'This default matches PruneMem\'s D5 dry-run convention: write-class tools require ' +
  'explicit opt-in to mutate disk.';

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
        'Absolute or relative path to working-state update input JSON. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    state: {
      type: 'string',
      description:
        'Absolute or relative path to working-state JSON to read/write. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    write: {
      type: 'boolean',
      description:
        'If true, writes the updated state to disk. Defaults to false (dry-run). ' +
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
  input: 'input',
  state: 'state',
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
    const result = await updateWorkingState(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
