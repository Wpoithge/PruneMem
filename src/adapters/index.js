export class RetrievalBackend {
  async search(_query, _options = {}) { throw new Error('not implemented'); }
  async getByMemoryId(_memoryId) { throw new Error('not implemented'); }
  async listByTopic(_topicKey, _options = {}) { throw new Error('not implemented'); }
  async listByDedupe(_dedupeKey, _options = {}) { throw new Error('not implemented'); }
}

export class ModelProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async extractFacts(_input, _options = {}) { throw new Error('not implemented'); }
  async judgeFacts(_input, _options = {}) { throw new Error('not implemented'); }
}

export class ProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = details.code || 'PROVIDER_ERROR';
    this.status = details.status ?? null;
    this.provider = details.provider || null;
    this.retryable = Boolean(details.retryable);
    this.details = details.details || null;
    this.cause = details.cause;
  }
}

export function getApiKeyFromEnv(config = {}) {
  const envName = config.apiKeyEnv;
  return envName ? process.env[envName] || '' : '';
}

export function ensureProviderConfig(config = {}, { requireModel = true } = {}) {
  if (!config || typeof config !== 'object') throw new Error('model provider config is required');
  if (!config.type) throw new Error('model provider type is required');
  if (requireModel && !config.model) throw new Error('model provider model is required');
  return config;
}
