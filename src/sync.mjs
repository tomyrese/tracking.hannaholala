import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const filePath = join(rootDir, 'ghn_orders.json');

const meaningfulFields = ['status', 'cod_amount', 'total_fee', 'updated_date'];

export function mergeOrdersSnapshot(existingOrders, newOrders) {
  const nextOrders = Array.isArray(existingOrders) ? [...existingOrders] : [];
  const orderMap = new Map();

  nextOrders.forEach((order, index) => {
    if (order.order_code) {
      orderMap.set(order.order_code, index);
    }
  });

  let addedCount = 0;
  let updatedCount = 0;

  for (const rawOrder of newOrders) {
    const orderCode = rawOrder.order_code;
    if (!orderCode) continue;

    if (orderMap.has(orderCode)) {
      const index = orderMap.get(orderCode);
      const existing = nextOrders[index];
      const changed = meaningfulFields.some((field) => String(existing?.[field] ?? '') !== String(rawOrder?.[field] ?? ''));

      if (changed) {
        nextOrders[index] = { ...existing, ...rawOrder };
        updatedCount++;
      }
    } else {
      nextOrders.push(rawOrder);
      addedCount++;
    }
  }

  nextOrders.sort((a, b) => {
    const dateA = new Date(a.order_date || a.created_date || 0);
    const dateB = new Date(b.order_date || b.created_date || 0);
    return dateB - dateA;
  });

  return {
    orders: nextOrders,
    addedCount,
    updatedCount,
  };
}

export async function syncGhnOrders(options = {}) {
  const {
    env = process.env,
    fetchImpl = fetch,
    readFileImpl = readFile,
    writeFileImpl = writeFile,
    dataFilePath = filePath,
  } = options;

  const token = env.GHN_TOKEN;
  const shopId = env.GHN_SHOP_ID || '5146557';
  const baseUrl = env.GHN_BASE_URL || 'https://online-gateway.ghn.vn/shiip/public-api';

  if (!token) {
    const detail = 'GHN_TOKEN is not configured in environment.';
    console.error(`[Sync] Error: ${detail}`);
    return {
      ok: false,
      skipped: true,
      reason: 'missing_ghn_credentials',
      detail,
    };
  }

  console.log(`[Sync] Starting GHN orders sync for Shop: ${shopId}...`);

  try {
    // 1. Read existing local database
    let existingOrders = [];
    try {
      const dataStr = await readFileImpl(dataFilePath, 'utf8');
      existingOrders = JSON.parse(dataStr);
    } catch (err) {
      console.log('[Sync] No existing ghn_orders.json found or failed to parse. Starting fresh.');
    }

    // 2. Fetch the 100 most recent orders from GHN search API
    // The search endpoint is under /v2/shipping-order/search
    const searchUrl = `${baseUrl.replace(/\/public-api$/, '')}/public-api/v2/shipping-order/search`;

    const response = await fetchImpl(searchUrl, {
      method: 'POST',
      headers: {
        'Token': token,
        'ShopId': String(shopId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offset: 0,
        limit: 100
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GHN search API responded with status ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    const newOrders = resData?.data?.data || [];

    console.log(`[Sync] Fetched ${newOrders.length} orders from GHN API.`);

    const { orders, addedCount, updatedCount } = mergeOrdersSnapshot(existingOrders, newOrders);

    // 5. Write back to ghn_orders.json
    await writeFileImpl(dataFilePath, JSON.stringify(orders, null, 2), 'utf8');

    console.log(`[Sync] Sync complete. Added: ${addedCount}, Updated: ${updatedCount}. Total orders in local DB: ${orders.length}`);
    return {
      ok: true,
      skipped: false,
      reason: null,
      detail: null,
      addedCount,
      updatedCount,
      totalOrders: orders.length,
    };
  } catch (err) {
    console.error(`[Sync] Sync failed: ${err.message}`);
    return {
      ok: false,
      skipped: false,
      reason: 'sync_failed',
      detail: err.message,
    };
  }
}
