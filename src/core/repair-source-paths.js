#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), write: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--write') out.write = true;
  }
  return out;
}
async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function readJsonl(filePath) { try { const raw = await fs.readFile(filePath, 'utf8'); return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function writeJsonIfMissing(dst, obj, { write } = { write: false }) { if (await exists(dst)) return false; if (!write) return true; await ensureDir(path.dirname(dst)); await fs.writeFile(dst, `${JSON.stringify(obj, null, 2)}\n`, 'utf8'); return true; }
function inferYm(memoryId) { const m = /^mem-(\d{4})(\d{2})/.exec(memoryId || ''); return m ? `${m[1]}-${m[2]}` : null; }

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);
  const regPath = path.join(root, 'examples', 'registry', 'memories.jsonl');
  const rows = await readJsonl(regPath);
  const actions = [];
  for (const row of rows) {
    const src = row.source_paths || {};
    const ym = inferYm(row.memory_id);
    if (!ym) continue;
    const pipelineDirRel = path.join('examples', 'pipeline', ym, row.memory_id);
    const pipelineDirAbs = path.join(root, pipelineDirRel);
    const targets = { packet: path.join(pipelineDirAbs, 'session-packet.json'), extract: path.join(pipelineDirAbs, 'extracted.json'), judge_input: path.join(pipelineDirAbs, 'judge-input.json'), judge: path.join(pipelineDirAbs, 'judged.json'), apply: path.join(pipelineDirAbs, 'apply.json') };
    const missingFields = Object.entries(src).filter(([, rel]) => rel).filter(([, rel]) => !path.isAbsolute(rel)).filter(([, rel]) => !existsSync(path.join(root, rel))).map(([field]) => field);
    if (!missingFields.length) continue;
    const touched = [];
    if (missingFields.includes('packet')) { const changed = await writeJsonIfMissing(targets.packet, { repaired: true, memory_id: row.memory_id, fact_id: row.fact_id, note: 'session-packet.json placeholder reconstructed from registry because original pipeline artifact was missing.' }, { write: args.write }); if (changed) touched.push('packet'); }
    if (missingFields.includes('extract')) { const changed = await writeJsonIfMissing(targets.extract, { repaired: true, memory_id: row.memory_id, fact_id: row.fact_id, facts: [], note: 'extracted.json placeholder reconstructed from registry because original pipeline artifact was missing.' }, { write: args.write }); if (changed) touched.push('extract'); }
    if (missingFields.includes('judge_input')) { const changed = await writeJsonIfMissing(targets.judge_input, { repaired: true, memory_id: row.memory_id, fact_id: row.fact_id, note: 'judge-input.json placeholder reconstructed from registry because original pipeline artifact was missing.' }, { write: args.write }); if (changed) touched.push('judge_input'); }
    if (missingFields.includes('judge')) { const changed = await writeJsonIfMissing(targets.judge, { repaired: true, memory_id: row.memory_id, fact_id: row.fact_id, judgement: { memory_class: row.memory_class, topic_key: row.topic_key, dedupe_key: row.dedupe_key, status: row.status, canonical_summary: row.canonical_summary }, note: 'judged.json placeholder reconstructed from registry because original pipeline artifact was missing.' }, { write: args.write }); if (changed) touched.push('judge'); }
    if (missingFields.includes('apply')) { const changed = await writeJsonIfMissing(targets.apply, { repaired: true, memory_id: row.memory_id, fact_id: row.fact_id, status: row.status, note: 'apply.json placeholder reconstructed from registry because original pipeline artifact was missing.' }, { write: args.write }); if (changed) touched.push('apply'); }
    if (touched.length) actions.push({ memory_id: row.memory_id, fact_id: row.fact_id, repaired_fields: touched, pipeline_dir: pipelineDirRel });
  }
  process.stdout.write(JSON.stringify({ ok: true, write: args.write, repaired: actions.length, actions }, null, 2) + '\n');
}
main().catch((err) => { console.error('[repair-source-paths] failed:', err); process.exit(1); });
