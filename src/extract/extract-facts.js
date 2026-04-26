import { createModelProvider } from '../runtime/provider-factory.js';
import { validateSessionPacket } from '../lib/validate-input.js';
import { normalizeProviderError } from '../runtime/provider-errors.js';

export async function extractFacts(input = {}, { provider, workspace = process.cwd(), prompt, ...options } = {}) {
  validateSessionPacket(input);
  const resolvedProvider = provider || await createModelProvider({ workspace });
  try {
    return await resolvedProvider.extractFacts(input, { prompt, ...options });
  } catch (error) {
    throw normalizeProviderError(error, { provider: resolvedProvider.config?.type || resolvedProvider.constructor?.name || 'unknown' });
  }
}
