#!/usr/bin/env node
import process from 'node:process';
import { OpenAICompatibleProvider } from '../../src/adapters/openai-compatible-provider.js';

function assert(cond, msg, extra = null) {
  if (!cond) {
    const err = new Error(msg);
    err.details = extra;
    throw err;
  }
}

async function main() {
  const provider = new OpenAICompatibleProvider({
    type: 'openai-compatible',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test-model',
  });

  provider.chat = async () => ({
    raw: { model: 'qwen3-coder-plus' },
    content: JSON.stringify({
      facts: [
        { fact_id: 'fact-001', fact_type: 'decision', text: 'Use Bailian for Memory V3.' },
      ],
    }),
  });
  const extracted = await provider.extractFacts({ memory_id: 'mem-test-001' });
  assert(extracted.schema_version === 'prunemem.extracted.v1', 'extract schema normalized');
  assert(extracted.memory_id === 'mem-test-001', 'extract memory_id preserved');
  assert(Array.isArray(extracted.facts) && extracted.facts.length === 1, 'extract facts normalized');

  provider.chat = async () => ({
    raw: { model: 'qwen3-coder-plus' },
    content: JSON.stringify({
      items: [
        {
          fact: { fact_id: 'fact-001', text: 'Use Bailian for Memory V3.' },
          memory_class: 'long_term_decision',
          topic_key: 'provider.bailian',
          dedupe_key: 'decision:bailian',
          target_layers: ['L1'],
          lifecycle: 'persistent',
        },
      ],
    }),
  });
  const judged = await provider.judgeFacts({ memory_id: 'mem-test-001', facts: [] });
  assert(judged.memory_id === 'mem-test-001', 'judge memory_id preserved');
  assert(Array.isArray(judged.result?.items) && judged.result.items.length === 1, 'judge items normalized');
  assert(judged.result.items[0].fact_id === 'fact-001', 'judge fact_id normalized from nested fact');
  assert(judged.result.items[0].canonical_summary === 'Use Bailian for Memory V3.', 'judge canonical_summary normalized');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        model: 'qwen3-coder-plus',
        choices: [
          {
            message: {
              content: [
                { type: 'output_text', text: '{"facts":[]}' },
              ],
            },
          },
        ],
      });
    },
  });
  try {
    const chatResult = await new OpenAICompatibleProvider({
      type: 'openai-compatible',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
    }).chat([]);
    assert(typeof chatResult.content === 'string' && chatResult.content.includes('{"facts":[]}'), 'chat content arrays normalize to string');
  } finally {
    globalThis.fetch = originalFetch;
  }

  process.stdout.write(JSON.stringify({ ok: true }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-openai-compatible-normalization] failed:', err.message || err, err.details || '');
  process.exit(1);
});
