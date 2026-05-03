#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { runSamplePipeline } from '../../src/core/run-sample-pipeline.js';

async function main() {
  const root = process.cwd();

  // run default preset without --write (dry-run, D6 default)
  const result = await runSamplePipeline({
    workspace: root,
    mock: true,
    // write intentionally omitted — verifies D6 dry-run default
  });

  // check whether examples/ was modified
  const exRegistryStatus = execSync('git status --porcelain examples/registry/', { cwd: root }).toString().trim();
  const exPipelineStatus = execSync('git status --porcelain examples/pipeline/', { cwd: root }).toString().trim();

  const checks = [
    { name: 'pipeline ran successfully under default preset dry-run', ok: result.ok === true },
    { name: 'updateRegistries returned write: false', ok: result.steps[2]?.write === false },
    { name: 'examples/registry/ not modified by dry-run', ok: exRegistryStatus === '' },
    { name: 'examples/pipeline/ not modified by dry-run', ok: exPipelineStatus === '' },
  ];

  const ok = checks.every((c) => c.ok);
  process.stdout.write(JSON.stringify({ ok, checks }, null, 2) + '\n');
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('[check-no-pollution] failed:', err);
  process.exit(1);
});
