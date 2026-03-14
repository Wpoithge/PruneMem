#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

async function runNode(script, args, cwd) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  const root = process.cwd();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'prunemem-cli-validation-'));
  const badSession = path.join(tmp, 'bad-session.json');
  const badExtracted = path.join(tmp, 'bad-extracted.json');
  await fs.writeFile(badSession, JSON.stringify({ schema_version: 'wrong', memory_id: '' }, null, 2));
  await fs.writeFile(badExtracted, JSON.stringify({ schema_version: 'prunemem.extracted.v1', memory_id: '', facts: [{}] }, null, 2));

  const extract = await runNode(path.join(root, 'src', 'core', 'run-extract.js'), ['--workspace', root, '--input', badSession, '--output', path.join(tmp, 'out.json')], root);
  const judge = await runNode(path.join(root, 'src', 'core', 'run-judge.js'), ['--workspace', root, '--input', badExtracted, '--output', path.join(tmp, 'out2.json')], root);

  const checks = [
    { name: 'run-extract rejects invalid session packet', ok: extract.code !== 0 && /schema_version/i.test(extract.stderr) },
    { name: 'run-judge rejects invalid extracted facts', ok: judge.code !== 0 && /memory_id/i.test(judge.stderr) },
  ];

  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-cli-validation] failed:', err);
  process.exit(1);
});
