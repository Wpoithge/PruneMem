#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
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

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);
  const inputPath = args.input || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'extracted.generated.json');
  const outputPath = args.output || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'judged.generated.json');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  validateExtractedFacts(input);

  let result;
  if (args.mock) {
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

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, input: path.relative(root, inputPath), output: path.relative(root, outputPath), mock: args.mock }, null, 2) + '\n');
}

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
