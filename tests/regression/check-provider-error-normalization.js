#!/usr/bin/env node
import process from 'node:process';
import { normalizeProviderError, ProviderError } from '../../src/runtime/provider-errors.js';

function main() {
  const timeoutError = normalizeProviderError({ name: 'AbortError', message: 'The operation was aborted.' }, { provider: 'openai-compatible' });
  const syntaxError = normalizeProviderError(new SyntaxError('Unexpected token < in JSON'), { provider: 'openai-compatible' });
  const passthrough = normalizeProviderError(new ProviderError('already normalized', { code: 'PROVIDER_HTTP_ERROR', status: 401, provider: 'bailian' }));

  const checks = [
    { name: 'abort errors normalize to timeout', ok: timeoutError.code === 'PROVIDER_TIMEOUT' && timeoutError.retryable === true },
    { name: 'syntax errors normalize to invalid json', ok: syntaxError.code === 'PROVIDER_INVALID_JSON' },
    { name: 'provider errors pass through', ok: passthrough.code === 'PROVIDER_HTTP_ERROR' && passthrough.status === 401 },
  ];

  process.stdout.write(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2) + '\n');
}

main();
