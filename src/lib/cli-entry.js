import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Determines whether the current module is being run directly as a CLI script.
 *
 * Handles edge cases that fileURLToPath alone misses:
 * - macOS /tmp → /private/tmp symlink mismatch
 * - spawn() launching a script via a different absolute path than its module location
 * - any symlinked path components in the script invocation path
 *
 * @param {string} importMetaUrl - pass `import.meta.url` from caller
 * @returns {boolean}
 */
export function isMainModule(importMetaUrl) {
  if (!process.argv[1]) return false;

  try {
    const moduleFile = realpathSync(fileURLToPath(importMetaUrl));
    const argvFile = realpathSync(process.argv[1]);
    return moduleFile === argvFile;
  } catch {
    return process.argv[1] === fileURLToPath(importMetaUrl);
  }
}
