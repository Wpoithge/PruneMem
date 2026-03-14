#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadBackendConfig } from '../runtime/load-config.js';
import { createModelProvider } from '../runtime/provider-factory.js';

async function main() {
  const workspace = process.argv.includes('--workspace')
    ? process.argv[process.argv.indexOf('--workspace') + 1]
    : process.cwd();
  const root = path.resolve(workspace);
  const cfg = await loadBackendConfig(root);
  const provider = await createModelProvider({ workspace: root, config: cfg.modelProvider });
  process.stdout.write(JSON.stringify({
    ok: true,
    provider_type: cfg.modelProvider?.type,
    model: cfg.modelProvider?.model || null,
    base_url: cfg.modelProvider?.baseUrl || null,
    api_key_env: cfg.modelProvider?.apiKeyEnv || null,
    provider_class: provider.constructor.name,
  }, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[check-provider-config] failed:', err);
  process.exit(1);
});
