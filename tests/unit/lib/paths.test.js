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

test('getPaths default preset workingMemoryRead equals workingMemory', () => {
  const p = getPaths({ workspace: '/foo' });
  assert.equal(p.workingMemoryRead, p.workingMemory);
  assert.equal(p.workingMemoryRead, '/foo/examples/working-memory');
});

test('getPaths isolated preset diverges working memory read and write', () => {
  const p = getPaths({ workspace: '/foo', preset: 'isolated' });
  assert.equal(p.workingMemory, '/foo/.prunemem-isolated/working-memory');
  assert.equal(p.workingMemoryRead, '/foo/examples/working-memory');
});

test('getPaths default preset memoryMdRead equals memoryMd', () => {
  const p = getPaths({ workspace: '/foo' });
  assert.equal(p.memoryMdRead, p.memoryMd);
  assert.equal(p.memoryMdRead, '/foo/examples/MEMORY.example.md');
});

test('getPaths isolated preset diverges MEMORY.md read and write', () => {
  const p = getPaths({ workspace: '/foo', preset: 'isolated' });
  assert.equal(p.memoryMd, '/foo/.prunemem-isolated/MEMORY.md');
  assert.equal(p.memoryMdRead, '/foo/examples/MEMORY.example.md');
});

test('getPaths override memoryMd=null couples memoryMdRead to null (D3 revision)', () => {
  const p = getPaths({ workspace: '/foo', preset: 'custom', override: { memoryMd: null } });
  assert.equal(p.memoryMd, null);
  assert.equal(p.memoryMdRead, null);
});

test('getPaths override memoryMdRead=null does NOT couple memoryMd (one-way coupling)', () => {
  const p = getPaths({ workspace: '/foo', preset: 'custom', override: { memoryMdRead: null } });
  assert.equal(p.memoryMd, '/foo/examples/MEMORY.example.md');
  assert.equal(p.memoryMdRead, null);
});

test('getPaths override memoryMd as string does NOT couple memoryMdRead', () => {
  const p = getPaths({ workspace: '/foo', preset: 'custom', override: { memoryMd: '/custom/MEMORY.md' } });
  assert.equal(p.memoryMd, '/custom/MEMORY.md');
  assert.equal(p.memoryMdRead, '/foo/examples/MEMORY.example.md');
});

test('getPaths isolated preset without memoryMd override leaves both fields independent', () => {
  const p = getPaths({ workspace: '/foo', preset: 'isolated' });
  assert.equal(p.memoryMd, '/foo/.prunemem-isolated/MEMORY.md');
  assert.equal(p.memoryMdRead, '/foo/examples/MEMORY.example.md');
});
