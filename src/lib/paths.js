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
      workingMemoryRead: path.join(root, 'examples', 'working-memory'),
      memoryMd: path.join(root, 'examples', 'MEMORY.example.md'),
      memoryMdRead: path.join(root, 'examples', 'MEMORY.example.md'),
    },
    isolated: {
      registry: path.join(root, '.prunemem-isolated', 'registry'),
      registryRead: path.join(root, 'examples', 'registry'),
      pipeline: path.join(root, '.prunemem-isolated', 'pipeline'),
      pipelineRead: path.join(root, 'examples', 'pipeline'),
      workingMemory: path.join(root, '.prunemem-isolated', 'working-memory'),
      workingMemoryRead: path.join(root, 'examples', 'working-memory'),
      memoryMd: path.join(root, '.prunemem-isolated', 'MEMORY.md'),
      memoryMdRead: path.join(root, 'examples', 'MEMORY.example.md'),
    },
  };

  // custom preset merges override into the same base as default.
  presets.custom = presets.default;

  const base = presets[preset];
  if (!base) {
    throw new Error(`unknown preset: ${preset}`);
  }

  // Merge override into base.
  // - Unknown field names are silently ignored (§2.3).
  // - undefined means "fallback to base", skip it.
  // - null and other values pass through as-is.
  const merged = { ...base };
  if (override && typeof override === 'object') {
    for (const [key, value] of Object.entries(override)) {
      if (!(key in base)) continue;      // unknown field: silent ignore
      if (value === undefined) continue; // fallback to base
      merged[key] = value;               // null, string, number, etc.
    }
  }

  // D3 coupling (after D1 second revision):
  // host opts out of MEMORY.md by passing { memoryMd: null }.
  // Couple memoryMdRead so consumers reading paths.memoryMdRead see null.
  // See docs/paths-design.md §7.2 "D3 implementation revision".
  if (override && Object.prototype.hasOwnProperty.call(override, 'memoryMd') && override.memoryMd === null) {
    merged.memoryMdRead = null;
  }

  return {
    workspace: root,
    registry:      merged.registry      ?? null,
    registryRead:  merged.registryRead  ?? null,
    pipeline:      merged.pipeline      ?? null,
    pipelineRead:  merged.pipelineRead  ?? null,
    workingMemory:     merged.workingMemory     ?? null,
    workingMemoryRead: merged.workingMemoryRead ?? null,
    memoryMd:      merged.memoryMd      ?? null,
    memoryMdRead:  merged.memoryMdRead  ?? null,
    preset,
    _raw: { workspace, preset, override },
  };
}

/**
 * @typedef {object} Paths
 * @property {string} workspace        - resolved workspace root (absolute)
 * @property {string} registry         - directory for *.jsonl registries (write path)
 * @property {string} registryRead     - directory to READ registries
 * @property {string} pipeline         - directory for sample-run artifacts (write path)
 * @property {string} pipelineRead     - directory to READ pipeline fixtures
 * @property {string} workingMemory     - directory for working state (write path)
 * @property {string} workingMemoryRead - directory to READ working memory state (= workingMemory, except for isolated)
 * @property {string|null} memoryMd     - path to MEMORY.md (or null if preset doesn't use it)
 * @property {string|null} memoryMdRead - path to MEMORY.md to READ (= memoryMd, except for isolated)
 * @property {string} preset           - which preset was used
 * @property {object} _raw             - the original input (for debugging)
 */
