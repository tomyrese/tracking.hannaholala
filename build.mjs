import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncGhnOrders } from './src/sync.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  try {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      process.env[key.trim()] = value;
    }
  } catch (error) {
    console.error('[Build] Error loading local .env file:', error.message);
  }
}

// Load .env locally before running sync
loadEnvFile();

console.log('[Build] Running pre-build GHN order synchronization...');
try {
  const result = await syncGhnOrders();
  if (result?.ok) {
    console.log(`[Build] Pre-build synchronization successfully completed. Added: ${result.addedCount}, Updated: ${result.updatedCount}, Total: ${result.totalOrders}`);
  } else if (result?.skipped) {
    console.warn(`[Build] Pre-build synchronization skipped: ${result.detail}`);
  } else {
    console.error(`[Build] Pre-build synchronization failed: ${result?.detail || 'Unknown sync error.'}`);
  }
} catch (error) {
  console.error('[Build] Pre-build synchronization failed:', error.message);
}
