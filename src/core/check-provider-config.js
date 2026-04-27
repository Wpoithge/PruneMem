#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { isMainModule } from '../lib/cli-entry.js';
import { loadBackendConfig } from '../runtime/load-config.js';
import { createModelProvider } from '../runtime/provider-factory.js';

/**
 * Check model provider configuration for a workspace.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @returns {Promise<{ok: boolean, provider_type: string, model: string, base_url: string, api_key_env: string, provider_class: string}>}
 */
export async function checkProviderConfig({
  workspace,
} = {}) {
  const root = path.resolve(workspace || process.cwd());
  const cfg = await loadBackendConfig(root);
  const provider = await createModelProvider({ workspace: root, config: cfg.modelProvider });
  return {
    ok: true,
    provider_type: cfg.modelProvider?.type,
    model: cfg.modelProvider?.model || null,
    base_url: cfg.modelProvider?.baseUrl || null,
    api_key_env: cfg.modelProvider?.apiKeyEnv || null,
    provider_class: provider.constructor.name,
  };
}

// ─── CLI shell ─────────────────────────────────

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const result = await checkProviderConfig({ workspace });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[check-provider-config] failed:', err);
    process.exit(1);
  });
}
