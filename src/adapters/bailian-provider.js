import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class BailianProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    const merged = {
      type: 'bailian',
      apiKeyEnv: config.apiKeyEnv || 'DASHSCOPE_API_KEY',
      baseUrl: config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      ...config,
    };
    super(merged);
  }
}
