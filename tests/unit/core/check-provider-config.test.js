import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProviderConfig } from '../../../src/core/check-provider-config.js';

test('checkProviderConfig - happy path with default workspace', async () => {
  const result = await checkProviderConfig({ workspace: '.' });

  assert.ok(result.ok, 'result should have ok: true');
  assert.ok(result.provider_type, 'should have provider_type');
  assert.ok(result.provider_class, 'should have provider_class');
});
