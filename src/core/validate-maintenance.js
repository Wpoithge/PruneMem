#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--strict') out.strict = true;
  }
  return out;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(row);
  }
  return m;
}

/**
 * Validate workspace registry for maintenance issues.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {boolean} [options.strict=false] - strict validation mode
 * @returns {Promise<{ok: boolean, strict: boolean, counts: object, samples: object, notes: array, paths: object}>}
 */
export async function validateMaintenance({
  workspace,
  strict = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const regDir = path.join(root, 'examples', 'registry');
  const runDir = path.join(root, 'examples', 'pipeline');
  const memoryMd = path.join(root, 'examples', 'MEMORY.example.md');

  const required = [
    path.join(regDir, 'topics.jsonl'),
    path.join(regDir, 'dedupe-index.jsonl'),
    path.join(regDir, 'lifecycle.jsonl'),
    path.join(regDir, 'memories.jsonl'),
    memoryMd,
  ];

  const missing = [];
  for (const p of required) {
    if (!(await exists(p))) missing.push(path.relative(root, p));
  }

  const memories = await readJsonl(path.join(regDir, 'memories.jsonl'));
  const lifecycle = await readJsonl(path.join(regDir, 'lifecycle.jsonl'));
  const topics = await readJsonl(path.join(regDir, 'topics.jsonl'));
  const dedupe = await readJsonl(path.join(regDir, 'dedupe-index.jsonl'));

  const memoryIds = new Set(memories.map((m) => m.memory_id));
  const activeMemories = memories.filter((m) => m.status === 'active');
  const activeByTopic = groupBy(activeMemories.filter((m) => m.topic_key), (m) => m.topic_key);
  const activeByDedupe = groupBy(activeMemories.filter((m) => m.dedupe_key), (m) => m.dedupe_key);

  const badSourcePaths = [];
  for (const row of memories) {
    const sp = row.source_paths || {};
    for (const [k, rel] of Object.entries(sp)) {
      if (!rel) continue;
      const full = path.join(root, rel);
      if (!(await exists(full))) badSourcePaths.push({ memory_id: row.memory_id, field: k, path: rel });
    }
  }

  const missingLifecycle = memories.filter((m) => !lifecycle.find((l) => l.memory_id === m.memory_id && l.fact_id === m.fact_id));
  const missingTopics = topics.filter((t) => !t.active_memory_id);

  const topicDanglingPointers = [];
  const topicSingleActiveMismatch = [];
  const topicNoActivePointer = [];
  for (const row of topics) {
    if (row.active_memory_id && !memoryIds.has(row.active_memory_id)) {
      topicDanglingPointers.push({ topic_key: row.topic_key, active_memory_id: row.active_memory_id });
    }
    const activeRows = activeByTopic.get(row.topic_key) || [];
    if (activeRows.length === 0 && row.active_memory_id) {
      topicNoActivePointer.push({ topic_key: row.topic_key, active_memory_id: row.active_memory_id });
    }
    if (activeRows.length === 1 && row.active_memory_id !== activeRows[0].memory_id) {
      topicSingleActiveMismatch.push({
        topic_key: row.topic_key,
        active_memory_id: row.active_memory_id || null,
        expected_memory_id: activeRows[0].memory_id,
      });
    }
  }

  const dedupeDanglingPointers = [];
  const dedupeCanonicalDrift = [];
  const dedupeSingleActiveMismatch = [];
  const dedupeNoActiveCanonical = [];
  for (const row of dedupe) {
    if (row.canonical_memory_id && !memoryIds.has(row.canonical_memory_id)) {
      dedupeDanglingPointers.push({ dedupe_key: row.dedupe_key, canonical_memory_id: row.canonical_memory_id });
    }
    const activeRows = activeByDedupe.get(row.dedupe_key) || [];
    if (row.canonical_memory_id && activeRows.length === 0) {
      dedupeNoActiveCanonical.push({ dedupe_key: row.dedupe_key, canonical_memory_id: row.canonical_memory_id });
    }
    if (row.canonical_memory_id && activeRows.length > 0 && !activeRows.some((m) => m.memory_id === row.canonical_memory_id)) {
      dedupeCanonicalDrift.push({
        dedupe_key: row.dedupe_key,
        canonical_memory_id: row.canonical_memory_id,
        active_memory_ids: activeRows.map((m) => m.memory_id),
      });
    }
    if (activeRows.length === 1 && row.canonical_memory_id !== activeRows[0].memory_id) {
      dedupeSingleActiveMismatch.push({
        dedupe_key: row.dedupe_key,
        canonical_memory_id: row.canonical_memory_id || null,
        expected_memory_id: activeRows[0].memory_id,
      });
    }
  }

  let memoryText = '';
  try { memoryText = await fs.readFile(memoryMd, 'utf8'); } catch {}
  const duplicateBullets = [];
  const seen = new Set();
  for (const line of memoryText.split('\n')) {
    if (!/^\s*[-*]\s+/.test(line)) continue;
    const key = line.replace(/^\s*[-*]\s+/, '').replace(/[`'"“”‘’]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) duplicateBullets.push(line.trim());
    seen.add(key);
  }

  const notes = [];
  if (missing.length) notes.push(`missing required files: ${missing.join(', ')}`);
  if (badSourcePaths.length) notes.push(`unreachable source_paths: ${badSourcePaths.length}`);
  if (missingLifecycle.length) notes.push(`memories without lifecycle rows: ${missingLifecycle.length}`);
  if (missingTopics.length) notes.push(`topics missing active_memory_id: ${missingTopics.length}`);
  if (topicDanglingPointers.length) notes.push(`topics with dangling active_memory_id: ${topicDanglingPointers.length}`);
  if (topicNoActivePointer.length) notes.push(`topics with active_memory_id but no active memories: ${topicNoActivePointer.length}`);
  if (topicSingleActiveMismatch.length) notes.push(`topics with single-active pointer mismatch: ${topicSingleActiveMismatch.length}`);
  if (dedupeDanglingPointers.length) notes.push(`dedupe rows with dangling canonical_memory_id: ${dedupeDanglingPointers.length}`);
  if (dedupeNoActiveCanonical.length) notes.push(`dedupe rows with canonical_memory_id but no active memories: ${dedupeNoActiveCanonical.length}`);
  if (dedupeCanonicalDrift.length) notes.push(`dedupe canonical drift: ${dedupeCanonicalDrift.length}`);
  if (dedupeSingleActiveMismatch.length) notes.push(`dedupe rows with single-active mismatch: ${dedupeSingleActiveMismatch.length}`);
  if (duplicateBullets.length) notes.push(`duplicate MEMORY.example.md bullets: ${duplicateBullets.length}`);
  if (!notes.length) notes.push('all maintenance checks passed');

  const ok = missing.length === 0
    && badSourcePaths.length === 0
    && (!strict || missingLifecycle.length === 0)
    && (!strict || duplicateBullets.length === 0)
    && (!strict || topicDanglingPointers.length === 0)
    && (!strict || topicNoActivePointer.length === 0)
    && (!strict || topicSingleActiveMismatch.length === 0)
    && (!strict || dedupeDanglingPointers.length === 0)
    && (!strict || dedupeNoActiveCanonical.length === 0)
    && (!strict || dedupeCanonicalDrift.length === 0)
    && (!strict || dedupeSingleActiveMismatch.length === 0);

  return {
    ok,
    strict,
    counts: {
      memories: memories.length,
      lifecycle: lifecycle.length,
      topics: topics.length,
      dedupe: dedupe.length,
      bad_source_paths: badSourcePaths.length,
      missing_lifecycle: missingLifecycle.length,
      missing_topic_active: missingTopics.length,
      topic_dangling_pointers: topicDanglingPointers.length,
      topic_no_active_pointer: topicNoActivePointer.length,
      topic_single_active_mismatch: topicSingleActiveMismatch.length,
      dedupe_dangling_pointers: dedupeDanglingPointers.length,
      dedupe_no_active_canonical: dedupeNoActiveCanonical.length,
      dedupe_canonical_drift: dedupeCanonicalDrift.length,
      dedupe_single_active_mismatch: dedupeSingleActiveMismatch.length,
      duplicate_memory_bullets: duplicateBullets.length
    },
    samples: {
      bad_source_paths: badSourcePaths.slice(0, 10),
      missing_lifecycle: missingLifecycle.slice(0, 10).map((x) => ({ memory_id: x.memory_id, fact_id: x.fact_id })),
      topic_dangling_pointers: topicDanglingPointers.slice(0, 10),
      topic_no_active_pointer: topicNoActivePointer.slice(0, 10),
      topic_single_active_mismatch: topicSingleActiveMismatch.slice(0, 10),
      dedupe_dangling_pointers: dedupeDanglingPointers.slice(0, 10),
      dedupe_no_active_canonical: dedupeNoActiveCanonical.slice(0, 10),
      dedupe_canonical_drift: dedupeCanonicalDrift.slice(0, 10),
      dedupe_single_active_mismatch: dedupeSingleActiveMismatch.slice(0, 10),
      duplicate_memory_bullets: duplicateBullets.slice(0, 10)
    },
    notes,
    paths: {
      registry: path.relative(root, regDir),
      pipeline: path.relative(root, runDir),
      memory_md: path.relative(root, memoryMd)
    }
  };
}

// ─── CLI shell ─────────────────────────────────

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv);
  validateMaintenance(args)
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.ok ? 0 : 1);
    })
    .catch(err => {
      console.error('[validate-maintenance] failed:', err);
      process.exit(1);
    });
}
