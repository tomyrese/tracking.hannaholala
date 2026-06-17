import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const config = {
  schedule: '*/10 * * * *',
};

const DEFAULT_GHN_BASE_URL = 'https://online-gateway.ghn.vn/shiip/public-api';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readBundledOrders() {
  const candidates = [
    resolve('ghn_orders.json'),
    join(process.cwd(), 'ghn_orders.json'),
    process.env.LAMBDA_TASK_ROOT && join(process.env.LAMBDA_TASK_ROOT, 'ghn_orders.json'),
    process.env.NETLIFY_FUNCTIONS_DIR && join(process.env.NETLIFY_FUNCTIONS_DIR, 'ghn_orders.json'),
    '/var/task/ghn_orders.json',
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Try the next bundled-file location.
    }
  }

  return [];
}

async function fetchLatestGhnOrders() {
  const token = process.env.GHN_TOKEN;
  const shopId = process.env.GHN_SHOP_ID;
  const baseUrl = process.env.GHN_BASE_URL || DEFAULT_GHN_BASE_URL;

  if (!token || !shopId) {
    throw new Error('Missing GHN_TOKEN or GHN_SHOP_ID.');
  }

  const searchUrl = `${baseUrl.replace(/\/public-api$/, '')}/public-api/v2/shipping-order/search`;
  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      Token: token,
      ShopId: String(shopId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ offset: 0, limit: 100 }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data?.code < 200 || data?.code >= 300) {
    throw new Error(data?.message || `GHN search API returned HTTP ${response.status}.`);
  }

  return data?.data?.data || [];
}

function hasMeaningfulChanges(currentOrders, latestOrders) {
  const currentMap = new Map(currentOrders.filter((order) => order.order_code).map((order) => [order.order_code, order]));

  for (const latest of latestOrders) {
    const current = currentMap.get(latest.order_code);
    if (!current) return true;

    const changedFields = ['status', 'cod_amount', 'total_fee', 'updated_date'];
    if (changedFields.some((field) => String(current[field] ?? '') !== String(latest[field] ?? ''))) {
      return true;
    }
  }

  return false;
}

export async function triggerBuildHook(fetchImpl = fetch) {
  const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!buildHookUrl) {
    console.warn('[Scheduled Sync] Skipping build hook trigger because NETLIFY_BUILD_HOOK_URL is not configured.');
    return {
      triggered: false,
      skipped: true,
      reason: 'missing_build_hook_url',
    };
  }

  const response = await fetchImpl(buildHookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Build hook returned HTTP ${response.status}: ${text}`);
  }

  return {
    triggered: true,
    skipped: false,
    reason: null,
  };
}

export async function runScheduledSync({
  readCurrentOrders = readBundledOrders,
  readLatestOrders = fetchLatestGhnOrders,
  triggerRebuild = triggerBuildHook,
} = {}) {
  const [currentOrders, latestOrders] = await Promise.all([
    readCurrentOrders(),
    readLatestOrders(),
  ]);

  const rebuildNeeded = hasMeaningfulChanges(currentOrders, latestOrders);
  const buildHook = rebuildNeeded
    ? await triggerRebuild()
    : { triggered: false, skipped: false, reason: null };

  return {
    checkedAt: new Date().toISOString(),
    latestCount: latestOrders.length,
    currentCount: currentOrders.length,
    rebuildNeeded,
    rebuildTriggered: buildHook.triggered,
    buildHookSkipped: buildHook.skipped,
    buildHookReason: buildHook.reason,
  };
}

export default async function handler() {
  try {
    const result = await runScheduledSync();
    return json(200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[Scheduled Sync] Failed:', error);
    return json(500, {
      ok: false,
      message: error.message,
    });
  }
}
