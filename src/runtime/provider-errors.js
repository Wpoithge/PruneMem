import { ProviderError } from '../adapters/index.js';

export { ProviderError };

export function normalizeProviderError(error, context = {}) {
  if (error instanceof ProviderError) return error;

  if (error?.name === 'AbortError') {
    return new ProviderError('provider request timed out', {
      code: 'PROVIDER_TIMEOUT',
      provider: context.provider,
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof SyntaxError) {
    return new ProviderError('provider returned invalid JSON', {
      code: 'PROVIDER_INVALID_JSON',
      provider: context.provider,
      details: error.message,
      cause: error,
    });
  }

  return new ProviderError(error?.message || 'provider request failed', {
    code: context.code || 'PROVIDER_ERROR',
    provider: context.provider,
    cause: error,
  });
}

export function describeProviderError(error) {
  const normalized = error instanceof ProviderError ? error : normalizeProviderError(error);
  return {
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    provider: normalized.provider,
    status: normalized.status,
    retryable: normalized.retryable,
    details: normalized.details,
  };
}
