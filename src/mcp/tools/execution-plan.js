import { executionPlan } from '../../core/execution-plan.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_execution_plan';

export const description =
  'Generate an execution plan, milestone state, and execution context ' +
  'from an execution-plan input file. Pure read; no disk writes.';

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
        'Absolute or relative path to execution-plan input JSON. ' +
        'If omitted, the core function resolves a workspace-relative default.',
    },
  },
  additionalProperties: false,
};

const ARG_MAP = {
  workspace: 'workspace',
  input: 'input',
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
    const result = await executionPlan(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
