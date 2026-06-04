import { updateWorkingState } from '../../core/update-working-state.js';
import { wrapStructuredResult, wrapThrownError } from '../shared/error.js';

export const name = 'prunemem_update_working_state';

export const description =
  'Read a working-state update (a "delta") from the input file, merge it into the current state, ' +
  'and produce the next state + runtime context. If write is true, persists the updated state to disk; ' +
  'defaults to false (dry-run), per PruneMem\'s D5 convention. ' +
  'ALWAYS update working-state through this tool with a delta input file — never hand-edit ' +
  '*.working-state.json / *.working-event.json directly. ' +
  'After a write, verify with prunemem_get_working_state: ok/written: true means the call ran, ' +
  'not that your delta merged (a malformed delta merges nothing).';

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
        'Path (string) to a JSON file shaped as {"delta": {...}}. ' +
        'Scalar fields are set directly: task_title, goal, status, user_request_summary, ' +
        'last_user_intent, last_agent_action_summary. ' +
        'Array fields MUST use a suffix or they are silently ignored: ' +
        '_added appends (completed_steps_added, in_progress_steps_added, next_actions_added, ' +
        'decisions_confirmed_added, open_questions_added, blocked_items_added, artifacts_added); ' +
        '_set replaces (e.g. in_progress_steps_set). ' +
        'This is an update-input shape with a top-level delta — NOT a generated working-event shape ' +
        'with state_delta (that artifact is not read here). ' +
        'Pass a file path string, not an inline object. ' +
        'If omitted, resolves a workspace-relative default.',
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
