import fs from 'node:fs/promises';

/**
 * Fields that contain non-deterministic timestamps or UUIDs.
 * These will be replaced with "<TIMESTAMP>" or "<UUID>" during comparison.
 */
const TIMESTAMP_FIELDS = [
  'archived_at',
  'created_at',
  'updated_at',
  'last_seen_at',
  'expires_at',
  'first_seen_at',
  'generated_at',
  'duration_ms',
];

const UUID_FIELDS = [
  'archive_id',
  'session_id',
  'memory_id',
  'fact_id',
];

/**
 * Recursively mask non-deterministic fields in an object.
 *
 * @param {any} obj - Object to mask
 * @returns {any} - Masked copy of the object
 */
export function maskNonDeterministic(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => maskNonDeterministic(item));
  }

  const masked = {};
  for (const [key, value] of Object.entries(obj)) {
    if (TIMESTAMP_FIELDS.includes(key)) {
      masked[key] = '<TIMESTAMP>';
    } else if (UUID_FIELDS.includes(key) && typeof value === 'string') {
      masked[key] = '<UUID>';
    } else if (typeof value === 'object') {
      masked[key] = maskNonDeterministic(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Compare actual output with golden file, masking non-deterministic fields.
 *
 * @param {string} actualJsonString - Actual JSON output as string
 * @param {string} goldenPath - Path to golden file
 * @returns {Promise<{equal: boolean, actual: object, golden: object, diff?: string}>}
 */
export async function compareGolden(actualJsonString, goldenPath) {
  const actualObj = JSON.parse(actualJsonString);
  const goldenContent = await fs.readFile(goldenPath, 'utf8');
  const goldenObj = JSON.parse(goldenContent);

  const maskedActual = maskNonDeterministic(actualObj);
  const maskedGolden = maskNonDeterministic(goldenObj);

  const actualStr = JSON.stringify(maskedActual, null, 2);
  const goldenStr = JSON.stringify(maskedGolden, null, 2);

  const equal = actualStr === goldenStr;

  return {
    equal,
    actual: maskedActual,
    golden: maskedGolden,
    diff: equal ? undefined : `Expected:\n${goldenStr}\n\nActual:\n${actualStr}`,
  };
}
