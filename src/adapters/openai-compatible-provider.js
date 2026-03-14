import { ModelProvider, ProviderError, ensureProviderConfig, getApiKeyFromEnv } from './index.js';

export class OpenAICompatibleProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    ensureProviderConfig(config);
    this.baseUrl = String(config.baseUrl || '').replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey || getApiKeyFromEnv(config);
    this.timeoutMs = Number(config.timeoutMs || 60000);
  }

  async chat(messages, options = {}) {
    if (!this.baseUrl) {
      throw new ProviderError('openai-compatible provider requires baseUrl', {
        code: 'PROVIDER_CONFIG_ERROR',
        provider: this.config.type || 'openai-compatible',
      });
    }
    if (!this.apiKey) {
      throw new ProviderError(`missing API key for ${this.config.apiKeyEnv || 'provider'}`, {
        code: 'PROVIDER_AUTH_MISSING',
        provider: this.config.type || 'openai-compatible',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.model,
          messages,
          temperature: options.temperature ?? 0,
          response_format: options.responseFormat,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new ProviderError(`provider HTTP ${res.status}`, {
          code: res.status === 401 || res.status === 403 ? 'PROVIDER_AUTH_ERROR' : 'PROVIDER_HTTP_ERROR',
          status: res.status,
          provider: this.config.type || 'openai-compatible',
          retryable: res.status >= 500 || res.status === 429,
          details: text,
        });
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new ProviderError('provider returned invalid JSON', {
          code: 'PROVIDER_INVALID_JSON',
          provider: this.config.type || 'openai-compatible',
          details: text.slice(0, 500),
          cause: error,
        });
      }
      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError('provider returned no message content', {
          code: 'PROVIDER_EMPTY_RESPONSE',
          provider: this.config.type || 'openai-compatible',
          details: json,
        });
      }
      return { raw: json, content };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error?.name === 'AbortError') {
        throw new ProviderError('provider request timed out', {
          code: 'PROVIDER_TIMEOUT',
          provider: this.config.type || 'openai-compatible',
          retryable: true,
          cause: error,
        });
      }
      throw new ProviderError(error?.message || 'provider request failed', {
        code: 'PROVIDER_REQUEST_FAILED',
        provider: this.config.type || 'openai-compatible',
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async extractFacts(input = {}, options = {}) {
    const prompt = options.prompt || `Extract candidate facts from the following session input and return strict JSON with shape {"facts": [...]}.\n\nInput:\n${JSON.stringify(input, null, 2)}`;
    const { content, raw } = await this.chat([
      { role: 'system', content: 'You are a structured information extractor. Return JSON only.' },
      { role: 'user', content: prompt },
    ], { ...options, responseFormat: { type: 'json_object' } });
    return { ...JSON.parse(content), provider: raw?.model || this.model };
  }

  async judgeFacts(input = {}, options = {}) {
    const prompt = options.prompt || `Judge the following extracted facts for a structured memory system and return strict JSON with shape {"result":{"items":[...]}}.\n\nInput:\n${JSON.stringify(input, null, 2)}`;
    const { content, raw } = await this.chat([
      { role: 'system', content: 'You are a structured memory judge. Return JSON only.' },
      { role: 'user', content: prompt },
    ], { ...options, responseFormat: { type: 'json_object' } });
    return { ...JSON.parse(content), provider: raw?.model || this.model };
  }
}
