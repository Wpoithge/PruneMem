#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  return {
    workspace: argv.includes('--workspace') ? argv[argv.indexOf('--workspace') + 1] : process.cwd(),
    mock: argv.includes('--mock'),
  };
}

async function runStep(script, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: process.env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout || `exit ${code}`));
      resolve(JSON.parse(stdout));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);
  const core = path.join(root, 'src', 'core');
  const sampleDir = path.join(root, 'examples', 'pipeline', 'sample-run-01');
  const extractArgs = ['--workspace', root, '--input', path.join(sampleDir, 'session-packet.json'), '--output', path.join(sampleDir, 'extracted.generated.json')];
  const judgeArgs = ['--workspace', root, '--input', path.join(sampleDir, 'extracted.generated.json'), '--output', path.join(sampleDir, 'judged.generated.json')];
  const updateArgs = ['--workspace', root, '--judged', path.join(sampleDir, 'judged.generated.json'), '--source-paths', path.join(sampleDir, 'apply.json'), '--memory-id', 'mem-example-generated', '--channel', 'webchat', '--agent', 'demo'];
  if (args.mock) {
    extractArgs.push('--mock');
    judgeArgs.push('--mock');
  }
  const steps = [];
  steps.push(await runStep(path.join(core, 'run-extract.js'), extractArgs, root));
  steps.push(await runStep(path.join(core, 'run-judge.js'), judgeArgs, root));
  steps.push(await runStep(path.join(core, 'update-registries.js'), updateArgs, root));
  process.stdout.write(JSON.stringify({ ok: true, mock: args.mock, steps }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[run-sample-pipeline] failed:', err);
  process.exit(1);
});
