#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { extractFacts } from '../extract/extract-facts.js';
import { extractFactsPrompt } from '../runtime/prompt-templates.js';
import { validateSessionPacket } from '../lib/validate-input.js';
import { describeProviderError } from '../runtime/provider-errors.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), input: null, output: null, mock: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--input') out.input = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--mock') out.mock = true;
  }
  return out;
}

/**
 * Extract facts from a session packet.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to session-packet.json
 * @param {string} [options.output] - path to write extracted.json
 * @param {boolean} [options.mock=false] - use mock output for deterministic testing
 * @returns {Promise<{ok: boolean, input: string, output: string, mock: boolean}>}
 */
export async function runExtract({
  workspace,
  input: inputPath,
  output: outputPath,
  mock = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalInputPath = inputPath || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'session-packet.json');
  const finalOutputPath = outputPath || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'extracted.generated.json');
  const input = JSON.parse(await fs.readFile(finalInputPath, 'utf8'));
  validateSessionPacket(input);

  let result;
  if (mock) {
    result = {
      schema_version: 'prunemem.extracted.v1',
      memory_id: input.memory_id,
      facts: [
        { fact_id: 'fact-001', fact_type: 'preference', text: 'Memory should be layered by signal and retrieval cost.' }
      ],
      note: 'mock extract output'
    };
  } else {
    result = await extractFacts(input, { workspace: root, prompt: extractFactsPrompt(input) });
  }

  await fs.writeFile(finalOutputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return { ok: true, input: path.relative(root, finalInputPath), output: path.relative(root, finalOutputPath), mock };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const result = await runExtract(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    const normalized = err?.name === 'ProviderError' ? describeProviderError(err) : {
      name: err?.name || 'Error',
      message: err?.message || String(err),
      kind: err?.kind || null,
      details: err?.details || null,
    };
    console.error('[run-extract] failed:', JSON.stringify(normalized, null, 2));
    process.exit(1);
  });
}
