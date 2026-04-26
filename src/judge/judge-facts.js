import { createModelProvider } from '../runtime/provider-factory.js';
import { validateExtractedFacts } from '../lib/validate-input.js';
import { normalizeProviderError } from '../runtime/provider-errors.js';

export async function judgeFacts(input = {}, { provider, workspace = process.cwd(), prompt, ...options } = {}) {
  validateExtractedFacts(input);
  const resolvedProvider = provider || await createModelProvider({ workspace });
  try {
    return await resolvedProvider.judgeFacts(input, { prompt, ...options });
  } catch (error) {
    throw normalizeProviderError(error, { provider: resolvedProvider.config?.type || resolvedProvider.constructor?.name || 'unknown' });
  }
}
