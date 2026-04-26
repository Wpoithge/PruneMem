import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadBackendConfig(workspace = process.cwd()) {
  const candidates = [
    path.join(workspace, 'config', 'backend.json'),
    path.join(workspace, 'config', 'backend.example.json'),
  ];
  for (const file of candidates) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {}
  }
  throw new Error('backend config not found');
}
