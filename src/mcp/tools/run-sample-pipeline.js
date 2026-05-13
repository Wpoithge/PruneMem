import { runSamplePipeline } from '../../core/run-sample-pipeline.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_run_sample_pipeline';

export const description =
  'Run the sample pipeline (extract → judge → repair-source-paths → update-registries). ' +
  'If write is true, persists final registry update to disk. Defaults to false (dry-run).\n\n' +
  'If mock is true, uses mocked LLM responses (no real API calls). Useful for testing ' +
  'and dry-run validation. Defaults to false (real LLM calls).\n\n' +
  '⚠️ IMPORTANT: The `write` parameter only controls the final `updateRegistries` step. ' +
  'The internal `extract` and `judge` steps unconditionally write `.generated.json` ' +
  'intermediate artifacts regardless of `write`. To run with zero disk side effects on ' +
  'your real workspace, use `preset: "isolated"` to sandbox all writes. See ' +
  'docs/mcp-tool-inventory.md "prunemem_run_sample_pipeline write-side-effect notice" ' +
  'for details.';

export const inputSchema = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Workspace root directory. Defaults to process.cwd().',
    },
    mock: {
      type: 'boolean',
      description:
        'If true, uses mocked LLM responses (no real API calls). Useful for testing ' +
        'and dry-run validation. Defaults to false (real LLM calls).',
    },
    write: {
      type: 'boolean',
      description:
        'If true, persists final registry update to disk. Defaults to false (dry-run). ' +
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
  mock: 'mock',
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
    const result = await runSamplePipeline(params);
    return wrapStructuredResult(result);
  } catch (err) {
    return wrapThrownError(err);
  }
}
