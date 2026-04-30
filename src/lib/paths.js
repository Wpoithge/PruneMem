import path from 'node:path';
import process from 'node:process';

/**
 * Resolve filesystem paths for a PruneMem workspace.
 *
 * @param {object} [options]
 * @param {string} [options.workspace] - workspace root, defaults to process.cwd()
 * @param {string} [options.preset='default'] - 'default' | 'isolated' | 'custom'
 * @param {object} [options.override] - partial paths object to merge into preset
 * @returns {Paths}
 */
export function getPaths({ workspace, preset = 'default', override } = {}) {
  const root = path.resolve(workspace || process.cwd());

  const presets = {
    default: {
      registry: path.join(root, 'examples', 'registry'),
      registryRead: path.join(root, 'examples', 'registry'),
      pipeline: path.join(root, 'examples', 'pipeline'),
      pipelineRead: path.join(root, 'examples', 'pipeline'),
      workingMemory: path.join(root, 'examples', 'working-memory'),
      memoryMd: path.join(root, 'examples', 'MEMORY.example.md'),
    },
    isolated: {
      registry: path.join(root, '.prunemem-isolated', 'registry'),
      registryRead: path.join(root, 'examples', 'registry'),
      pipeline: path.join(root, '.prunemem-isolated', 'pipeline'),
      pipelineRead: path.join(root, 'examples', 'pipeline'),
      workingMemory: path.join(root, '.prunemem-isolated', 'working-memory'),
      memoryMd: path.join(root, '.prunemem-isolated', 'MEMORY.md'),
    },
  };

  const base = presets[preset];
  if (!base) {
    throw new Error(`unknown preset: ${preset}`);
  }

  // Merge override into base. Explicit null in override is preserved.
  const merged = { ...base };
  if (override && typeof override === 'object') {
    for (const [key, value] of Object.entries(override)) {
      if (value === null) {
        merged[key] = null;
      } else if (typeof value === 'string') {
        merged[key] = value;
      }
      // Unknown fields or non-string/non-null values are silently ignored.
    }
  }

  return {
    workspace: root,
    registry: merged.registry,
    registryRead: merged.registryRead,
    pipeline: merged.pipeline,
    pipelineRead: merged.pipelineRead,
    workingMemory: merged.workingMemory,
    memoryMd: merged.memoryMd,
    preset,
    _raw: merged,
  };
}

/**
 * @typedef {object} Paths
 * @property {string} workspace        - resolved workspace root (absolute)
 * @property {string} registry         - directory for *.jsonl registries (write path)
 * @property {string} registryRead     - directory to READ registries
 * @property {string} pipeline         - directory for sample-run artifacts (write path)
 * @property {string} pipelineRead     - directory to READ pipeline fixtures
 * @property {string} workingMemory    - directory for working state
 * @property {string|null} memoryMd    - path to MEMORY.md (or null if preset doesn't use it)
 * @property {string} preset           - which preset was used
 * @property {object} _raw             - the raw config used (for debugging)
 */
