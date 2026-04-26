#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

async function run() {
  const root = process.cwd();
  const script = path.join(root, 'src', 'core', 'check-provider-config.js');
  const child = spawn(process.execPath, [script, '--workspace', root], { cwd: root, env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) {
    console.error(stderr || stdout);
    process.exit(code || 1);
  }
  const out = JSON.parse(stdout);
  const checks = [
    { name: 'provider config loads', ok: out.ok === true },
    { name: 'provider class resolved', ok: typeof out.provider_class === 'string' && out.provider_class.length > 0 },
    { name: 'provider type present', ok: typeof out.provider_type === 'string' && out.provider_type.length > 0 },
  ];
  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), provider: out, checks }, null, 2) + '\n');
}

run().catch((err) => {
  console.error('[check-provider-config] failed:', err);
  process.exit(1);
});
