import { buildRuntimeContext } from '../../core/build-runtime-context.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_runtime_context';

export const description =
  'Build the runtime context, execution context, and context bundle ' +
  "from a workspace's working state and execution plan. Pure read; no disk writes.";

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    state: {
      type: 'string',
      description:
        'Absolute or relative path to working-state.json. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
    plan: {
      type: 'string',
      description:
        'Absolute or relative path to execution-plan.json. ' +
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
  state: 'state',
  plan: 'plan',
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
    const result = await buildRuntimeContext(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
