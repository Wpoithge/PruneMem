import { OpenAICompatibleProvider } from '../adapters/openai-compatible-provider.js';
import { BailianProvider } from '../adapters/bailian-provider.js';
import { loadBackendConfig } from './load-config.js';

export async function createModelProvider({ workspace = process.cwd(), config } = {}) {
  const resolved = config || (await loadBackendConfig(workspace)).modelProvider;
  if (!resolved?.type) throw new Error('modelProvider.type is required');
  switch (resolved.type) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider(resolved);
    case 'bailian':
      return new BailianProvider(resolved);
    default:
      throw new Error(`unsupported model provider type: ${resolved.type}`);
  }
}
