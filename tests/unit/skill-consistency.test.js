import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TOP = path.join(ROOT, 'skills/prunemem-memory-governance/SKILL.md');
const PLUGIN = path.join(ROOT, 'plugins/claude-code/skills/prunemem-memory-governance/SKILL.md');

function bodyOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  // 去掉开头 --- ... --- 的 YAML frontmatter
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

test('prunemem-memory-governance: 两份 SKILL.md 正文一致', () => {
  for (const f of [TOP, PLUGIN]) {
    assert.ok(fs.existsSync(f), `缺少 SKILL.md: ${f}`);
  }
  assert.strictEqual(
    bodyOf(TOP),
    bodyOf(PLUGIN),
    '两份 SKILL.md 正文已漂移(顶层=Hermes/external_dirs,plugin=CC/Codex)。请重新同步——见 Step 6.5.4 对账。'
  );
});
