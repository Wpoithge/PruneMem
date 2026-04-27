#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = { workspace: process.cwd(), write: false, limit: 100 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--write') out.write = true;
    else if (a === '--limit') out.limit = Number(argv[++i] || 100);
  }
  return out;
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function writeJsonl(filePath, rows) {
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, text ? text + '\n' : '', 'utf8');
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

function byTimeDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

function rowKey(row) {
  return `${row.memory_id}:${row.fact_id || ''}:${row.dedupe_key || ''}`;
}

function lifecycleKey(row) {
  return `${row.memory_id}:${row.fact_id || ''}`;
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function pickKeeper(rows = []) {
  return byTimeDesc(rows)[0] || null;
}

function normalizeSummary(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, '')
    .replace(/[+]/g, ' and ')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[.,;:!?/\\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSummary(text) {
  return normalizeSummary(text).split(' ').map((s) => s.trim()).filter(Boolean);
}

function jaccardSimilarity(aTokens = [], bTokens = []) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

const RISK_PATTERNS = [/\bnow\b/i,/\bno longer\b/i,/\bonly\b/i,/\bexcept\b/i,/\bdisabled\b/i,/\benabled\b/i,/\bswitched\b/i,/\bmigrated\b/i,/\bdeprecated\b/i,/\bafter\b/i,/\bbefore\b/i,/\bcurrent(?:ly)?\b/i,/改为/,/不再/,/现在/,/只写/,/只/,/以后/,/升级后/,/恢复/,/回退/,/停用/,/启用/];
function hasRiskSignals(text) { return RISK_PATTERNS.some((re) => re.test(String(text || ''))); }
function contextNoteAutoMergeMode(rows = []) {
  if (rows.length < 2) return null;
  const summaries = rows.map((r) => String(r.canonical_summary || ''));
  if (summaries.some(hasRiskSignals)) return null;
  const normalized = summaries.map(normalizeSummary);
  const unique = uniq(normalized);
  if (unique.length === 1) return 'exact';
  if (unique.length !== 2) return null;
  const [a, b] = unique.sort((x, y) => x.length - y.length);
  if (!a || !b) return null;
  if (b.startsWith(a) || a.startsWith(b)) return 'safe-extension';
  return null;
}
function contextNoteDryRunCandidate(rows = []) {
  if (rows.length < 2) return null;
  const summaries = rows.map((r) => String(r.canonical_summary || ''));
  if (summaries.some(hasRiskSignals)) return null;
  if (contextNoteAutoMergeMode(rows)) return null;
  const normalized = summaries.map(normalizeSummary);
  const unique = uniq(normalized);
  if (unique.length !== 2) return null;
  const sim = jaccardSimilarity(tokenizeSummary(unique[0]), tokenizeSummary(unique[1]));
  if (sim < 0.4) return null;
  return { kind: 'context-note-merge-candidate', merge_mode: 'dry-run-similar', confidence: Number(sim.toFixed(3)), topic_key: rows[0]?.topic_key || null, dedupe_key: rows[0]?.dedupe_key || null, memory_ids: rows.map((r) => r.memory_id), fact_ids: rows.map((r) => r.fact_id), summaries };
}

/**
 * Apply curator decisions to a workspace's registry.
 * Resolves multi-active memories, normalizes pointers, and merges context notes.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {boolean} [options.write=false] - actually write changes to registry
 * @param {number} [options.limit=100] - max actions to apply per call
 * @returns {Promise<{ok: boolean, write: boolean, actions: array, dry_run_candidates: array, summary: object}>}
 */
export async function curatorApply({
  workspace,
  write = false,
  limit = 100,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const regDir = path.join(root, 'examples', 'registry');
  const memoriesPath = path.join(regDir, 'memories.jsonl');
  const lifecyclePath = path.join(regDir, 'lifecycle.jsonl');
  const topicsPath = path.join(regDir, 'topics.jsonl');
  const dedupePath = path.join(regDir, 'dedupe-index.jsonl');

  const [memories, lifecycleRows, topicsRows, dedupeRows] = await Promise.all([
    readJsonl(memoriesPath), readJsonl(lifecyclePath), readJsonl(topicsPath), readJsonl(dedupePath)
  ]);

  const memoriesMap = new Map(memories.map((r) => [rowKey(r), { ...r }]));
  const lifecycleMap = new Map(lifecycleRows.map((r) => [lifecycleKey(r), { ...r }]));
  const topicsMap = new Map(topicsRows.map((r) => [r.topic_key, { ...r }]));
  const dedupeMap = new Map(dedupeRows.map((r) => [r.dedupe_key, { ...r }]));
  const actions = [];
  const dryRunCandidates = [];
  const nowIso = new Date().toISOString();

  const allMemories = [...memoriesMap.values()];
  const activeMemories = allMemories.filter((r) => r.status === 'active');
  const activeByTopic = groupBy(activeMemories.filter((r) => r.topic_key), (r) => r.topic_key);
  const activeByDedupe = groupBy(activeMemories.filter((r) => r.dedupe_key), (r) => r.dedupe_key);

  for (const [topicKey, topic] of topicsMap.entries()) {
    const activeRows = activeByTopic.get(topicKey) || [];
    if (activeRows.length !== 1) continue;
    const keeper = activeRows[0];
    if (topic.active_memory_id === keeper.memory_id) continue;
    const previousActive = topic.active_memory_id || null;
    topic.active_memory_id = keeper.memory_id;
    topic.history = uniq([...(topic.history || []), keeper.memory_id]);
    topic.updated_at = nowIso;
    topicsMap.set(topicKey, topic);
    actions.push({ kind: 'normalize-topic-pointer', topic_key: topicKey, previous_active_memory_id: previousActive, next_active_memory_id: keeper.memory_id });
  }

  for (const [dedupeKey, dedupe] of dedupeMap.entries()) {
    const activeRows = activeByDedupe.get(dedupeKey) || [];
    if (activeRows.length === 0) {
      if (!dedupe.canonical_memory_id) continue;
      const previousCanonical = dedupe.canonical_memory_id;
      dedupe.canonical_memory_id = null;
      dedupe.aliases = uniq([...(dedupe.aliases || []), previousCanonical]);
      dedupe.updated_at = nowIso;
      dedupe.last_seen_at = nowIso;
      dedupeMap.set(dedupeKey, dedupe);
      actions.push({ kind: 'clear-stale-dedupe-pointer', dedupe_key: dedupeKey, previous_canonical_memory_id: previousCanonical, next_canonical_memory_id: null });
      continue;
    }
    if (activeRows.length !== 1) continue;
    const keeper = activeRows[0];
    if (dedupe.canonical_memory_id === keeper.memory_id) continue;
    const previousCanonical = dedupe.canonical_memory_id || null;
    dedupe.canonical_memory_id = keeper.memory_id;
    dedupe.aliases = uniq([...(dedupe.aliases || []), keeper.memory_id, previousCanonical]);
    dedupe.updated_at = nowIso;
    dedupe.last_seen_at = nowIso;
    dedupeMap.set(dedupeKey, dedupe);
    actions.push({ kind: 'normalize-dedupe-pointer', dedupe_key: dedupeKey, previous_canonical_memory_id: previousCanonical, next_canonical_memory_id: keeper.memory_id });
  }

  const groups = groupBy(activeMemories, (r) => `${r.memory_class}||${r.dedupe_key}||${r.topic_key}`);
  for (const [, rows] of groups) {
    if (rows.length < 2) continue;
    const klass = rows[0].memory_class;
    if (!['temporary_task', 'ops_event', 'context_note'].includes(klass)) continue;
    if (klass === 'context_note') {
      const candidate = contextNoteDryRunCandidate(rows);
      if (candidate) dryRunCandidates.push(candidate);
      if (!contextNoteAutoMergeMode(rows)) continue;
    }
    const sorted = byTimeDesc(rows);
    const keeper = pickKeeper(sorted);
    const losers = sorted.slice(1);
    if (!keeper) continue;
    for (const loser of losers) {
      const mem = memoriesMap.get(rowKey(loser));
      if (!mem) continue;
      const newStatus = klass === 'temporary_task' ? 'expired' : 'merged';
      mem.status = newStatus;
      mem.updated_at = nowIso;
      memoriesMap.set(rowKey(mem), mem);
      const lk = lifecycleKey(loser);
      const life = lifecycleMap.get(lk) || { memory_id: loser.memory_id, fact_id: loser.fact_id, first_seen_at: loser.created_at || nowIso };
      life.status = newStatus;
      life.lifecycle = klass === 'temporary_task' ? 'expired' : (life.lifecycle || 'reviewable');
      life.last_seen_at = nowIso;
      if (newStatus === 'expired') life.expires_at = nowIso;
      lifecycleMap.set(lk, life);
      actions.push({ kind: klass === 'context_note' ? 'merge-context-note' : 'resolve-multi-active', merge_mode: klass === 'context_note' ? contextNoteAutoMergeMode(rows) : undefined, memory_class: klass, keeper_memory_id: keeper.memory_id, loser_memory_id: loser.memory_id, fact_id: loser.fact_id, applied_status: newStatus, topic_key: loser.topic_key, dedupe_key: loser.dedupe_key });
    }
    if (keeper.topic_key && topicsMap.has(keeper.topic_key)) {
      const topic = topicsMap.get(keeper.topic_key);
      topic.active_memory_id = keeper.memory_id;
      topic.history = uniq([...(topic.history || []), keeper.memory_id, ...losers.map((x) => x.memory_id)]);
      topic.updated_at = nowIso;
      topicsMap.set(topic.topic_key, topic);
    }
    if (keeper.dedupe_key && dedupeMap.has(keeper.dedupe_key)) {
      const dedupe = dedupeMap.get(keeper.dedupe_key);
      dedupe.canonical_memory_id = keeper.memory_id;
      dedupe.aliases = uniq([...(dedupe.aliases || []), keeper.memory_id, ...losers.map((x) => x.memory_id)]);
      dedupe.updated_at = nowIso;
      dedupe.last_seen_at = nowIso;
      dedupeMap.set(dedupe.dedupe_key, dedupe);
    }
  }

  const refreshedMemories = [...memoriesMap.values()];
  const refreshedActive = refreshedMemories.filter((r) => r.status === 'active');
  const refreshedActiveByDedupe = groupBy(refreshedActive.filter((r) => r.dedupe_key), (r) => r.dedupe_key);
  const refreshedActiveByTopic = groupBy(refreshedActive.filter((r) => r.topic_key), (r) => r.topic_key);

  for (const [dedupeKey, dedupe] of dedupeMap.entries()) {
    const activeRows = refreshedActiveByDedupe.get(dedupeKey) || [];
    if (activeRows.length === 0) {
      if (!dedupe.canonical_memory_id) continue;
      const previousCanonical = dedupe.canonical_memory_id;
      dedupe.canonical_memory_id = null;
      dedupe.aliases = uniq([...(dedupe.aliases || []), previousCanonical]);
      dedupe.updated_at = nowIso;
      dedupe.last_seen_at = nowIso;
      dedupeMap.set(dedupeKey, dedupe);
      actions.push({ kind: 'clear-stale-dedupe-pointer', dedupe_key: dedupeKey, previous_canonical_memory_id: previousCanonical, next_canonical_memory_id: null, phase: 'post-resolve' });
      continue;
    }
    if (activeRows.length !== 1) continue;
    const keeper = activeRows[0];
    if (dedupe.canonical_memory_id === keeper.memory_id) continue;
    const previousCanonical = dedupe.canonical_memory_id || null;
    dedupe.canonical_memory_id = keeper.memory_id;
    dedupe.aliases = uniq([...(dedupe.aliases || []), keeper.memory_id, previousCanonical]);
    dedupe.updated_at = nowIso;
    dedupe.last_seen_at = nowIso;
    dedupeMap.set(dedupeKey, dedupe);
    actions.push({ kind: 'normalize-dedupe-pointer', dedupe_key: dedupeKey, previous_canonical_memory_id: previousCanonical, next_canonical_memory_id: keeper.memory_id, phase: 'post-resolve' });
  }

  for (const [topicKey, topic] of topicsMap.entries()) {
    const activeRows = refreshedActiveByTopic.get(topicKey) || [];
    if (activeRows.length !== 1) continue;
    const keeper = activeRows[0];
    if (topic.active_memory_id === keeper.memory_id) continue;
    const previousActive = topic.active_memory_id || null;
    topic.active_memory_id = keeper.memory_id;
    topic.history = uniq([...(topic.history || []), keeper.memory_id]);
    topic.updated_at = nowIso;
    topicsMap.set(topicKey, topic);
    actions.push({ kind: 'normalize-topic-pointer', topic_key: topicKey, previous_active_memory_id: previousActive, next_active_memory_id: keeper.memory_id, phase: 'post-resolve' });
  }

  const result = { ok: true, write, actions: actions.slice(0, limit), dry_run_candidates: dryRunCandidates.slice(0, limit), summary: { applied: actions.length, expired: actions.filter((a) => a.applied_status === 'expired').length, merged: actions.filter((a) => a.applied_status === 'merged').length, normalized_topic_pointers: actions.filter((a) => a.kind === 'normalize-topic-pointer').length, normalized_dedupe_pointers: actions.filter((a) => a.kind === 'normalize-dedupe-pointer').length, cleared_stale_dedupe_pointers: actions.filter((a) => a.kind === 'clear-stale-dedupe-pointer').length, resolved_multi_active: actions.filter((a) => a.kind === 'resolve-multi-active').length, merged_context_notes: actions.filter((a) => a.kind === 'merge-context-note').length, context_note_merge_candidates: dryRunCandidates.length } };

  if (write && actions.length) {
    await Promise.all([writeJsonl(memoriesPath, [...memoriesMap.values()]), writeJsonl(lifecyclePath, [...lifecycleMap.values()]), writeJsonl(topicsPath, [...topicsMap.values()]), writeJsonl(dedupePath, [...dedupeMap.values()])]);
  }
  return result;
}

// ─── CLI shell ─────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  curatorApply(args)
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    })
    .catch(err => {
      console.error('[curator-apply] failed:', err);
      process.exit(1);
    });
}
