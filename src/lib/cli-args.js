import fs from 'node:fs';

/**
 * Parse --preset and --paths flags from argv. Used by core scripts to support
 * paths.js preset/override at the CLI layer.
 *
 * Two standard usage patterns:
 *
 * 1. For files that already have a parseArgs function (10 of 14 core scripts):
 *
 *    function parseArgs(argv) {
 *      const out = { workspace: process.cwd(), ... };
 *      const presetArgs = parsePresetArgs(argv);
 *      Object.assign(out, presetArgs);
 *      for (let i = 2; i < argv.length; i++) {
 *        // skip --preset and --paths flags (already consumed by parsePresetArgs)
 *        if (argv[i] === '--preset' || argv[i] === '--paths') { i++; continue; }
 *        // ... existing flag parsing
 *      }
 *      return out;
 *    }
 *
 * 2. For files without a parseArgs function (4 of 14 core scripts):
 *
 *    if (isMainModule(import.meta.url)) {
 *      const { preset, override } = parsePresetArgs(process.argv);
 *      myFunction({ workspace: process.cwd(), preset, override })
 *        .then(...)
 *        .catch(...);
 *    }
 *
 * @param {string[]} argv - typically process.argv
 * @returns {{preset?: string, override?: object}}
 *   - preset: 'default' | 'isolated' | 'custom' if --preset was passed, else undefined
 *   - override: parsed JSON object if --paths <file> was passed, else undefined
 *
 * Behavior:
 * - --preset value not in {'default','isolated','custom'} throws Error
 * - --paths file not readable or not valid JSON throws Error
 * - --paths without --preset custom emits a stderr warning, override still returned
 * - Both flags absent returns {} (caller treats as default preset, no override)
 */
export function parsePresetArgs(argv) {
  let preset;
  let pathsFile;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset') {
      preset = argv[++i];
    } else if (a === '--paths') {
      pathsFile = argv[++i];
    }
  }

  if (preset !== undefined && !['default', 'isolated', 'custom'].includes(preset)) {
    throw new Error(`invalid --preset value: ${preset}. Must be 'default' | 'isolated' | 'custom'.`);
  }

  let override;
  if (pathsFile) {
    let raw;
    try {
      raw = fs.readFileSync(pathsFile, 'utf8');
    } catch (err) {
      throw new Error(`failed to read --paths file: ${pathsFile}: ${err.message}`);
    }
    try {
      override = JSON.parse(raw);
    } catch (err) {
      throw new Error(`failed to parse --paths file as JSON: ${pathsFile}: ${err.message}`);
    }

    if (preset !== 'custom') {
      process.stderr.write(
        `[parsePresetArgs] warning: --paths is only consumed when --preset custom. Got --preset ${preset || '(unset, defaults to default)'}.
`
      );
    }
  }

  const result = {};
  if (preset !== undefined) result.preset = preset;
  if (override !== undefined) result.override = override;
  return result;
}
