import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPaths } from '../../../src/lib/paths.js';

test('getPaths default preset matches current hardcoded paths', () => {
  const p = getPaths({ workspace: '/foo' });
  assert.equal(p.registry, '/foo/examples/registry');
  assert.equal(p.registryRead, '/foo/examples/registry');
  assert.equal(p.preset, 'default');
});

test('getPaths isolated preset diverges read and write', () => {
  const p = getPaths({ workspace: '/foo', preset: 'isolated' });
  assert.equal(p.registry, '/foo/.prunemem-isolated/registry');
  assert.equal(p.registryRead, '/foo/examples/registry');
});

test('getPaths custom preset merges override into default', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'custom',
    override: { registry: '/bar/registry' }
  });
  assert.equal(p.registry, '/bar/registry');
  assert.equal(p.pipeline, '/foo/examples/pipeline');
});

test('getPaths custom preset preserves explicit null override', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'custom',
    override: { memoryMd: null }
  });
  assert.equal(p.memoryMd, null);
});

test('getPaths default preset accepts override too', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'default',
    override: { registry: '/elsewhere' }
  });
  assert.equal(p.registry, '/elsewhere');
  assert.equal(p.pipeline, '/foo/examples/pipeline');
});

test('getPaths throws on unknown preset', () => {
  assert.throws(() => getPaths({ workspace: '/foo', preset: 'nonsense' }));
});

test('getPaths workspace defaults to process.cwd()', () => {
  const p = getPaths({});
  assert.equal(p.workspace, process.cwd());
});
