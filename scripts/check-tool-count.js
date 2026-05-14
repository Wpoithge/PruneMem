#!/usr/bin/env node
/**
 * check-tool-count.js — Single source of truth for tool count consistency.
 *
 * 1. Parses src/mcp/server.js TOOLS array → authoritative tool module count.
 * 2. Parses each src/mcp/tools/*.js → authoritative tool names (prunemem_*).
 * 3. Scans docs for numeric claims ("N 个 tool", "N tools", etc.) → must match count.
 * 4. Weak-validation: every prunemem_* name mentioned in docs must exist in TOOLS.
 *
 * Exit: 0 on pass, 1 on failure (so run-checks.sh can use set -e).
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SERVER_PATH = path.join(ROOT, 'src/mcp/server.js');
const TOOLS_DIR = path.join(ROOT, 'src/mcp/tools');

// Docs that may contain tool-count claims or tool-name references.
const DOC_PATHS = [
  'README.md',
  'README.zh.md',
  'docs/mcp-server.md',
  'docs/mcp-tools.md',
];

// ─── 1. Authoritative count from TOOLS array ────────────────────────────────

function getAuthoritativeCount() {
  const content = fs.readFileSync(SERVER_PATH, 'utf-8');
  const match = content.match(/const\s+TOOLS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    return { count: null, error: 'could not find TOOLS array in src/mcp/server.js' };
  }
  const inner = match[1];
  // Split by comma, trim, drop empty/comment-only items
  const items = inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('//'));
  return { count: items.length, error: null };
}

// ─── 2. Authoritative tool names from tool modules ──────────────────────────

function getAuthoritativeNames() {
  const names = [];
  for (const file of fs.readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');
    const match = content.match(/export\s+const\s+name\s*=\s*['"]([^'"]+)['"]/);
    if (match) {
      names.push(match[1]);
    }
  }
  return names.sort();
}

// ─── 3. Scan docs for count claims ──────────────────────────────────────────

const COUNT_PATTERNS = [
  { re: /(\d+)\s*个\s*tool/i, desc: "N 个 tool" },
  { re: /(\d+)\s+tools/i, desc: "N tools" },
  { re: /提供\s*(\d+)\s*个/i, desc: "提供 N 个" },
  { re: /注册\s*(\d+)\s*个/i, desc: "注册 N 个" },
];

function scanDocsForCountClaims(expectedCount) {
  const issues = [];
  for (const docRel of DOC_PATHS) {
    const docPath = path.join(ROOT, docRel);
    if (!fs.existsSync(docPath)) continue;
    const content = fs.readFileSync(docPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { re } of COUNT_PATTERNS) {
        const m = line.match(re);
        if (m) {
          const claimed = parseInt(m[1], 10);
          if (claimed !== expectedCount) {
            issues.push(
              `${docRel}:${i + 1}: claims ${claimed} tools, expected ${expectedCount} — "${line.trim()}"`
            );
          }
        }
      }
    }
  }
  return issues;
}

// ─── 4. Scan docs/integrations/*.md (optional, may not exist yet) ───────────

function scanIntegrationsForCountClaims(expectedCount) {
  const issues = [];
  const dir = path.join(ROOT, 'docs/integrations');
  if (!fs.existsSync(dir)) return issues;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const docPath = path.join(dir, file);
    const content = fs.readFileSync(docPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { re } of COUNT_PATTERNS) {
        const m = line.match(re);
        if (m) {
          const claimed = parseInt(m[1], 10);
          if (claimed !== expectedCount) {
            issues.push(
              `docs/integrations/${file}:${i + 1}: claims ${claimed} tools, expected ${expectedCount} — "${line.trim()}"`
            );
          }
        }
      }
    }
  }
  return issues;
}

// ─── 5. Weak validation: every prunemem_* in docs must be a known tool ──────

function scanDocsForToolNames(validNames) {
  const issues = [];
  const nameRe = /prunemem_[a-z_]+/g;
  const validSet = new Set(validNames);

  const allDocs = [...DOC_PATHS];
  const integrationsDir = path.join(ROOT, 'docs/integrations');
  if (fs.existsSync(integrationsDir)) {
    for (const file of fs.readdirSync(integrationsDir)) {
      if (file.endsWith('.md')) {
        allDocs.push(`docs/integrations/${file}`);
      }
    }
  }

  for (const docRel of allDocs) {
    const docPath = path.join(ROOT, docRel);
    if (!fs.existsSync(docPath)) continue;
    const content = fs.readFileSync(docPath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(nameRe);
      if (matches) {
        for (const name of matches) {
          if (!validSet.has(name)) {
            issues.push(
              `${docRel}:${i + 1}: unknown tool name "${name}" — "${line.trim()}"`
            );
          }
        }
      }
    }
  }
  return issues;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const { count, error } = getAuthoritativeCount();
if (error) {
  console.error(`FAIL: ${error}`);
  process.exit(1);
}

const names = getAuthoritativeNames();

const countIssues = [
  ...scanDocsForCountClaims(count),
  ...scanIntegrationsForCountClaims(count),
];
const nameIssues = scanDocsForToolNames(names);

const allIssues = [...countIssues, ...nameIssues];

if (allIssues.length === 0) {
  console.log(`PASS: tool count consistency (${count} tools, ${names.length} names)`);
  process.exit(0);
} else {
  console.log(`FAIL: tool count consistency (${count} tools, ${names.length} names)`);
  for (const issue of allIssues) {
    console.log(`  - ${issue}`);
  }
  process.exit(1);
}
