#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function writeJsonl(filePath, rows) { await ensureDir(path.dirname(filePath)); const text = rows.map((row) => JSON.stringify(row)).join('\n'); await fs.writeFile(filePath, text ? `${text}\n` : '', 'utf8'); }
function runNode(script, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env: process.env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout || `exit ${code}`));
      try { resolve(JSON.parse(stdout)); } catch (err) { reject(new Error(`failed to parse JSON stdout: ${err.message}\n${stdout}`)); }
    });
  });
}
function memoryRow({ memory_id, fact_id, summary, topic_key, dedupe_key, updated_at }) { return { memory_id, fact_id, memory_class: 'context_note', topic_key, dedupe_key, status: 'active', canonical_summary: summary, targets: ['L1'], source_paths: {}, created_at: updated_at, updated_at, channel: 'webchat', agent: 'demo' }; }
function lifecycleRow({ memory_id, fact_id, updated_at }) { return { memory_id, fact_id, lifecycle: 'reviewable', status: 'active', first_seen_at: updated_at, last_seen_at: updated_at, expires_at: null }; }
function topicRow(topic_key, active_memory_id, history, updated_at) { return { topic_key, active_memory_id, state: 'active', history, updated_at }; }
function dedupeRow(dedupe_key, canonical_memory_id, aliases, updated_at) { return { dedupe_key, canonical_memory_id, aliases, updated_at, last_seen_at: updated_at, evidence_count: aliases.length }; }

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'prunemem-context-note-check-'));
  const root = workspace;
  const reg = path.join(root, 'examples', 'registry');
  const now = '2026-03-13T13:30:00.000Z';
  await ensureDir(reg);
  await fs.writeFile(path.join(root, 'examples', 'MEMORY.example.md'), '# test\n', 'utf8');
  const memories = [
    memoryRow({ memory_id: 'mem-exact-a', fact_id: 'fact-001', topic_key: 'ctx.exact', dedupe_key: 'ctx:exact', summary: 'Session context should be archived on /new trigger', updated_at: '2026-03-13T13:00:00.000Z' }),
    memoryRow({ memory_id: 'mem-exact-b', fact_id: 'fact-001', topic_key: 'ctx.exact', dedupe_key: 'ctx:exact', summary: 'Session context should be archived on /new trigger', updated_at: '2026-03-13T13:01:00.000Z' }),
    memoryRow({ memory_id: 'mem-sim-a', fact_id: 'fact-001', topic_key: 'ctx.similar', dedupe_key: 'ctx:similar', summary: 'Archive session context when new trigger runs', updated_at: '2026-03-13T13:02:00.000Z' }),
    memoryRow({ memory_id: 'mem-sim-b', fact_id: 'fact-001', topic_key: 'ctx.similar', dedupe_key: 'ctx:similar', summary: 'Persist session context when /new is triggered', updated_at: '2026-03-13T13:03:00.000Z' }),
    memoryRow({ memory_id: 'mem-risk-a', fact_id: 'fact-001', topic_key: 'ctx.risk', dedupe_key: 'ctx:risk', summary: 'Session context should be archived on /new trigger', updated_at: '2026-03-13T13:04:00.000Z' }),
    memoryRow({ memory_id: 'mem-risk-b', fact_id: 'fact-001', topic_key: 'ctx.risk', dedupe_key: 'ctx:risk', summary: 'Session context should now only be archived to L1 on /new trigger', updated_at: '2026-03-13T13:05:00.000Z' })
  ];
  const lifecycle = memories.map((m) => lifecycleRow({ memory_id: m.memory_id, fact_id: m.fact_id, updated_at: m.updated_at }));
  const topics = [topicRow('ctx.exact', 'mem-exact-a', ['mem-exact-a', 'mem-exact-b'], now), topicRow('ctx.similar', 'mem-sim-a', ['mem-sim-a', 'mem-sim-b'], now), topicRow('ctx.risk', 'mem-risk-a', ['mem-risk-a', 'mem-risk-b'], now)];
  const dedupe = [dedupeRow('ctx:exact', 'mem-exact-a', ['mem-exact-a', 'mem-exact-b'], now), dedupeRow('ctx:similar', 'mem-sim-a', ['mem-sim-a', 'mem-sim-b'], now), dedupeRow('ctx:risk', 'mem-risk-a', ['mem-risk-a', 'mem-risk-b'], now)];
  await writeJsonl(path.join(reg, 'memories.jsonl'), memories);
  await writeJsonl(path.join(reg, 'lifecycle.jsonl'), lifecycle);
  await writeJsonl(path.join(reg, 'topics.jsonl'), topics);
  await writeJsonl(path.join(reg, 'dedupe-index.jsonl'), dedupe);
  const repoRoot = process.cwd();
  const result = await runNode(path.join(repoRoot, 'src', 'core', 'curator-apply.js'), ['--workspace', root, '--write'], repoRoot);
  const finalMemories = (await fs.readFile(path.join(reg, 'memories.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const exactLoser = finalMemories.find((r) => r.memory_id === 'mem-exact-a');
  const exactKeeper = finalMemories.find((r) => r.memory_id === 'mem-exact-b');
  const simA = finalMemories.find((r) => r.memory_id === 'mem-sim-a');
  const simB = finalMemories.find((r) => r.memory_id === 'mem-sim-b');
  const riskA = finalMemories.find((r) => r.memory_id === 'mem-risk-a');
  const riskB = finalMemories.find((r) => r.memory_id === 'mem-risk-b');
  const checks = [
    { name: 'exact auto-merge keeper stays active', ok: exactKeeper?.status === 'active' },
    { name: 'exact auto-merge loser becomes merged', ok: exactLoser?.status === 'merged' },
    { name: 'similar pair stays active (dry-run only)', ok: simA?.status === 'active' && simB?.status === 'active' },
    { name: 'dry-run candidate emitted for similar pair', ok: (result.dry_run_candidates || []).some((x) => x.dedupe_key === 'ctx:similar') },
    { name: 'risk pair not auto-merged', ok: riskA?.status === 'active' && riskB?.status === 'active' },
    { name: 'risk pair not emitted as dry-run candidate', ok: !(result.dry_run_candidates || []).some((x) => x.dedupe_key === 'ctx:risk') }
  ];
  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), workspace, summary: result.summary, actions: result.actions, dry_run_candidates: result.dry_run_candidates, checks }, null, 2) + '\n');
}
main().catch((err) => { console.error('[check-context-note-merge] failed:', err); process.exit(1); });
