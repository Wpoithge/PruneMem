#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { getPaths } from '../lib/paths.js';
import { parsePresetArgs } from '../lib/cli-args.js';
import { runExtract } from './run-extract.js';
import { runJudge } from './run-judge.js';
import { updateRegistries } from './update-registries.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), mock: false, write: false };
  const presetArgs = parsePresetArgs(argv);
  Object.assign(out, presetArgs);

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset' || a === '--paths') { i++; continue; }

    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--mock') out.mock = true;
    else if (a === '--write') out.write = true;
  }
  return out;
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
  write = false,
  preset,
  override,
  paths: paths_in,
} = {}) {
  const paths = paths_in ?? getPaths({ workspace, preset, override });
  const readDir = path.join(paths.pipelineRead, 'sample-run-01');
  const writeDir = path.join(paths.pipeline, 'sample-run-01');
  const steps = [];
  steps.push(await runExtract({ paths, input: path.join(readDir, 'session-packet.json'), output: path.join(writeDir, 'extracted.generated.json'), mock }));
  steps.push(await runJudge({ paths, input: path.join(writeDir, 'extracted.generated.json'), output: path.join(writeDir, 'judged.generated.json'), mock }));
  steps.push(await updateRegistries({ paths, judged: path.join(writeDir, 'judged.generated.json'), sourcePaths: path.join(readDir, 'apply.json'), memoryId: 'mem-example-generated', channel: 'webchat', agent: 'demo', write }));
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
