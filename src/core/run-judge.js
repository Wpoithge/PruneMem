#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { getPaths } from '../lib/paths.js';
import { parsePresetArgs } from '../lib/cli-args.js';
import { judgeFacts } from '../judge/judge-facts.js';
import { judgeFactsPrompt } from '../runtime/prompt-templates.js';
import { validateExtractedFacts } from '../lib/validate-input.js';
import { describeProviderError } from '../runtime/provider-errors.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), input: null, output: null, mock: false };
  const presetArgs = parsePresetArgs(argv);
  Object.assign(out, presetArgs);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset' || a === '--paths') { i++; continue; }

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
 * @param {string} [options.preset] - paths preset
 * @param {object} [options.override] - partial paths override
 * @param {object} [options.paths] - pre-resolved paths (skips getPaths call)
 * @returns {Promise<{ok: boolean, input: string, output: string, mock: boolean}>}
 */
export async function runJudge({
  workspace,
  input: inputPath,
  output: outputPath,
  mock = false,
  preset,
  override,
  paths: paths_in,
} = {}) {
  const paths = paths_in ?? getPaths({ workspace, preset, override });
  const finalInputPath = inputPath || path.join(paths.pipelineRead, 'sample-run-01', 'extracted.generated.json');
  const finalOutputPath = outputPath || path.join(paths.pipeline, 'sample-run-01', 'judged.generated.json');
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
    result = await judgeFacts(input, { workspace: paths.workspace, prompt: judgeFactsPrompt(input) });
  }

  await fs.mkdir(path.dirname(finalOutputPath), { recursive: true });
  await fs.writeFile(finalOutputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return { ok: true, input: path.relative(paths.workspace, finalInputPath), output: path.relative(paths.workspace, finalOutputPath), mock };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const result = await runJudge(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
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
