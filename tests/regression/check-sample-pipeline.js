#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

async function main() {
  const repoRoot = process.cwd();
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prunemem-sample-pipeline-'));
  await copyDir(path.join(repoRoot, 'examples'), path.join(tmpRoot, 'examples'));
  await copyDir(path.join(repoRoot, 'config'), path.join(tmpRoot, 'config'));
  await copyDir(path.join(repoRoot, 'src'), path.join(tmpRoot, 'src'));

  const script = path.join(repoRoot, 'src', 'core', 'run-sample-pipeline.js');
  const child = spawn(process.execPath, [script, '--workspace', tmpRoot, '--mock'], { cwd: repoRoot, env: process.env });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) {
    console.error(stderr || stdout);
    process.exit(code || 1);
  }
  const out = JSON.parse(stdout);
  const checks = [
    { name: 'sample pipeline completed', ok: out.ok === true },
    { name: 'three steps executed', ok: Array.isArray(out.steps) && out.steps.length === 3 },
    { name: 'mock mode enabled', ok: out.mock === true },
  ];
  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), workspace: tmpRoot, result: out, checks }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-sample-pipeline] failed:', err);
  process.exit(1);
});
