import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSamplePipeline } from '../../../src/core/run-sample-pipeline.js';

test('runSamplePipeline - mock mode end-to-end', async () => {
  const result = await runSamplePipeline({ workspace: '.', mock: true });

  assert.equal(result.ok, true, 'pipeline should succeed in mock mode');
  assert.equal(result.mock, true, 'mock flag should propagate');
  assert.ok(Array.isArray(result.steps), 'steps should be an array');
  assert.equal(result.steps.length, 3, 'should run 3 steps (extract → judge → update-registries)');

  for (const step of result.steps) {
    assert.equal(step.ok, true, `step should be ok: ${JSON.stringify(step)}`);
  }
});

test('runSamplePipeline - mock mode produces extract → judge → update-registries chain', async () => {
  const result = await runSamplePipeline({ workspace: '.', mock: true });

  assert.match(result.steps[0].output, /extracted\.generated\.json$/);
  assert.equal(result.steps[0].mock, true);

  assert.match(result.steps[1].input, /extracted\.generated\.json$/);
  assert.match(result.steps[1].output, /judged\.generated\.json$/);
  assert.equal(result.steps[1].mock, true);

  assert.ok(typeof result.steps[2].inserted === 'number');
  assert.ok(result.steps[2].files);
  assert.match(result.steps[2].files.memories, /memories\.jsonl$/);
});
