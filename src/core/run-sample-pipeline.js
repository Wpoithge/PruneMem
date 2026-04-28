#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { runExtract } from './run-extract.js';
import { runJudge } from './run-judge.js';
import { updateRegistries } from './update-registries.js';

function parseArgs(argv) {
  return {
    workspace: argv.includes('--workspace') ? argv[argv.indexOf('--workspace') + 1] : process.cwd(),
    mock: argv.includes('--mock'),
  };
}


/**
 * Run the sample extract → judge → update-registries pipeline.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {boolean} [options.mock=false] - use mock LLM provider for deterministic testing
 * @returns {Promise<{ok: boolean, mock: boolean, steps: array}>}
 */
export async function runSamplePipeline({
  workspace,
  mock = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const sampleDir = path.join(root, 'examples', 'pipeline', 'sample-run-01');
  const steps = [];
  steps.push(await runExtract({ workspace: root, input: path.join(sampleDir, 'session-packet.json'), output: path.join(sampleDir, 'extracted.generated.json'), mock }));
  steps.push(await runJudge({ workspace: root, input: path.join(sampleDir, 'extracted.generated.json'), output: path.join(sampleDir, 'judged.generated.json'), mock }));
  steps.push(await updateRegistries({ workspace: root, judged: path.join(sampleDir, 'judged.generated.json'), sourcePaths: path.join(sampleDir, 'apply.json'), memoryId: 'mem-example-generated', channel: 'webchat', agent: 'demo' }));
  return { ok: true, mock, steps };
}

// ─── CLI shell ─────────────────────────────────

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv);
  runSamplePipeline(args)
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    })
    .catch((err) => {
      console.error('[run-sample-pipeline] failed:', err);
      process.exit(1);
    });
}
