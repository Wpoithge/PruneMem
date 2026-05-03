#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runSamplePipeline } from '../../src/core/run-sample-pipeline.js';

async function main() {
  const root = process.cwd();
  const isolatedDir = path.join(root, '.prunemem-isolated');

  // cleanup any residue from prior runs
  if (existsSync(isolatedDir)) {
    rmSync(isolatedDir, { recursive: true, force: true });
  }

  // run isolated preset with write=true
  const result = await runSamplePipeline({
    workspace: root,
    preset: 'isolated',
    mock: true,
    write: true,
  });

  // check whether examples/ was polluted
  const exRegistryStatus = execSync('git status --porcelain examples/registry/', { cwd: root }).toString().trim();
  const exPipelineStatus = execSync('git status --porcelain examples/pipeline/', { cwd: root }).toString().trim();

  // verify isolated output was actually written
  const isolatedRegistryExists = existsSync(path.join(isolatedDir, 'registry'));
  const isolatedPipelineExists = existsSync(path.join(isolatedDir, 'pipeline'));

  // cleanup isolated dir regardless of pass/fail
  rmSync(isolatedDir, { recursive: true, force: true });

  const checks = [
    { name: 'pipeline ran successfully under isolated preset', ok: result.ok === true },
    { name: 'examples/registry/ not polluted by isolated write', ok: exRegistryStatus === '' },
    { name: 'examples/pipeline/ not polluted by isolated write', ok: exPipelineStatus === '' },
    { name: '.prunemem-isolated/registry/ was written', ok: isolatedRegistryExists },
    { name: '.prunemem-isolated/pipeline/ was written', ok: isolatedPipelineExists },
  ];

  const ok = checks.every((c) => c.ok);
  process.stdout.write(JSON.stringify({ ok, checks }, null, 2) + '\n');
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('[check-isolated-preset] failed:', err);
  process.exit(1);
});
