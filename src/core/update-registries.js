#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
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
  await ensureDir(path.dirname(filePath));
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, text ? `${text}\n` : '', 'utf8');
}

function parseArgs(argv) {
  const out = { workspace: process.cwd(), judged: null, sourcePaths: null, memoryId: null, channel: 'demo', agent: 'demo' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--judged') out.judged = argv[++i];
    else if (a === '--source-paths') out.sourcePaths = argv[++i];
    else if (a === '--memory-id') out.memoryId = argv[++i];
    else if (a === '--channel') out.channel = argv[++i];
    else if (a === '--agent') out.agent = argv[++i];
  }
  return out;
}

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);
  const regDir = path.join(root, 'examples', 'registry');
  await ensureDir(regDir);

  const judgedPath = args.judged || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'judged.json');
  const sourcePathsPath = args.sourcePaths || path.join(root, 'examples', 'pipeline', 'sample-run-01', 'apply.json');
  const judged = await readJson(judgedPath, { result: { items: [] } });
  const apply = await readJson(sourcePathsPath, { files: [], violations: [] });
  const items = judged?.result?.items || judged?.items || [];
  const memoryId = args.memoryId || judged?.memory_id || 'mem-example-001';
  const nowIso = new Date().toISOString();

  const sourcePaths = {};
  for (const file of apply.files || []) {
    const p = file?.filePath;
    if (!p) continue;
    if (/session-packet\.json$/.test(p)) sourcePaths.packet = p;
    else if (/extracted\.json$/.test(p)) sourcePaths.extract = p;
    else if (/judge-input\.json$/.test(p)) sourcePaths.judge_input = p;
    else if (/judged\.json$/.test(p)) sourcePaths.judge = p;
    else if (/apply\.json$/.test(p)) sourcePaths.apply = p;
    else if (/layers\/l1\//.test(p)) sourcePaths.l1 = p;
    else if (/layers\/l2\//.test(p)) sourcePaths.l2 = p;
    else if (/layers\/l3\//.test(p)) sourcePaths.l3 = p;
  }

  const topicsPath = path.join(regDir, 'topics.jsonl');
  const dedupePath = path.join(regDir, 'dedupe-index.jsonl');
  const lifecyclePath = path.join(regDir, 'lifecycle.jsonl');
  const memoriesPath = path.join(regDir, 'memories.jsonl');

  const [topicsRows, dedupeRows, lifecycleRows, memoryRows] = await Promise.all([
    readJsonl(topicsPath),
    readJsonl(dedupePath),
    readJsonl(lifecyclePath),
    readJsonl(memoriesPath),
  ]);

  const topics = new Map(topicsRows.map((row) => [row.topic_key, row]));
  const dedupe = new Map(dedupeRows.map((row) => [row.dedupe_key, row]));
  const lifecycle = new Map(lifecycleRows.map((row) => [`${row.memory_id}:${row.fact_id || ''}`, row]));
  const memories = new Map(memoryRows.map((row) => [`${row.memory_id}:${row.fact_id || ''}:${row.dedupe_key || ''}`, row]));

  let inserted = 0;
  for (const item of items) {
    if (!item || item.memory_class === 'discard') continue;
    const row = {
      memory_id: memoryId,
      fact_id: item.fact_id,
      memory_class: item.memory_class,
      topic_key: item.topic_key,
      dedupe_key: item.dedupe_key,
      status: 'active',
      canonical_summary: item.canonical_summary,
      targets: item.target_layers || ['L1'],
      source_paths: sourcePaths,
      created_at: nowIso,
      updated_at: nowIso,
      channel: args.channel,
      agent: args.agent,
    };
    memories.set(`${row.memory_id}:${row.fact_id || ''}:${row.dedupe_key || ''}`, row);

    if (row.topic_key) {
      const t = topics.get(row.topic_key) || { topic_key: row.topic_key, active_memory_id: row.memory_id, state: 'active', history: [] };
      t.active_memory_id = row.memory_id;
      t.state = 'active';
      t.history = uniq([...(t.history || []), row.memory_id]);
      t.updated_at = nowIso;
      topics.set(row.topic_key, t);
    }

    if (row.dedupe_key) {
      const d = dedupe.get(row.dedupe_key) || { dedupe_key: row.dedupe_key, canonical_memory_id: row.memory_id, aliases: [], evidence_count: 0 };
      d.canonical_memory_id = row.memory_id;
      d.aliases = uniq([...(d.aliases || []), row.memory_id]);
      d.updated_at = nowIso;
      d.last_seen_at = nowIso;
      d.evidence_count = (d.evidence_count || 0) + 1;
      dedupe.set(row.dedupe_key, d);
    }

    lifecycle.set(`${row.memory_id}:${row.fact_id || ''}`, {
      memory_id: row.memory_id,
      fact_id: row.fact_id,
      lifecycle: item.lifecycle || 'persistent',
      status: 'active',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      expires_at: null,
    });
    inserted += 1;
  }

  await Promise.all([
    writeJsonl(topicsPath, [...topics.values()]),
    writeJsonl(dedupePath, [...dedupe.values()]),
    writeJsonl(lifecyclePath, [...lifecycle.values()]),
    writeJsonl(memoriesPath, [...memories.values()]),
  ]);

  process.stdout.write(JSON.stringify({
    ok: true,
    inserted,
    files: {
      topics: path.relative(root, topicsPath),
      dedupe: path.relative(root, dedupePath),
      lifecycle: path.relative(root, lifecyclePath),
      memories: path.relative(root, memoriesPath),
    }
  }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[update-registries] failed:', err);
  process.exit(1);
});
