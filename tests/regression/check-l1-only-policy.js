#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function main() {
  const root = process.cwd();
  const policyPath = path.join(root, 'config', 'memory-policy.example.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  const checks = [
    { name: 'applyTargets only contains L1', ok: JSON.stringify(policy.runtimePolicy?.applyTargets || []) === JSON.stringify(['L1']) },
    { name: 'MEMORY writes disabled', ok: policy.runtimePolicy?.allowMemoryMdWrites === false },
    { name: 'daily-note writes disabled', ok: policy.runtimePolicy?.allowDailyNoteWrites === false },
  ];
  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-l1-only-policy] failed:', err);
  process.exit(1);
});
