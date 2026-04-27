#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { judgeFacts } from '../judge/judge-facts.js';
import { judgeFactsPrompt } from '../runtime/prompt-templates.js';
import { validateExtractedFacts } from '../lib/validate-input.js';
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
 * Judge extracted facts and classify them into memory classes.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {string} [options.input] - path to extracted.json
 * @param {string} [options.output] - path to write judged.json
 * @param {boolean} [options.mock=false] - use mock output for deterministic testing
 * @returns {Promise<{ok: boolean, input: string, output: string, mock: boolean}>}
 */
export async function runJudge({
  workspace,
  input: inputPath,
  output: outputPath,
  mock = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const finalInputPath = inputPath || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'extracted.generated.json');
  const finalOutputPath = outputPath || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'judged.generated.json');
  const input = JSON.parse(await fs.readFile(finalInputPath, 'utf8'));
  validateExtractedFacts(input);

  let result;
  if (mock) {
    result = {
      memory_id: input.memory_id,
      result: {
        items: [
          {
            fact_id: 'fact-001',
            memory_class: 'long_term_preference',
            topic_key: 'example.preference.memory-layering',
            dedupe_key: 'pref:memory:layering',
            lifecycle: 'persistent',
            target_layers: ['L1'],
            canonical_summary: 'Layer memory by signal and retrieval cost.'
          }
        ]
      },
      note: 'mock judge output'
    };
  } else {
    result = await judgeFacts(input, { workspace: root, prompt: judgeFactsPrompt(input) });
  }

  await fs.writeFile(finalOutputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return { ok: true, input: path.relative(root, finalInputPath), output: path.relative(root, finalOutputPath), mock };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const result = await runJudge(args);
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
    console.error('[run-judge] failed:', JSON.stringify(normalized, null, 2));
    process.exit(1);
  });
}
