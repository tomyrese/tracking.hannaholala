import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const filePath = join(rootDir, 'ghn_orders.json');

export async function syncGhnOrders() {
  const token = process.env.GHN_TOKEN;
  const shopId = process.env.GHN_SHOP_ID || '5146557';
  const baseUrl = process.env.GHN_BASE_URL || 'https://online-gateway.ghn.vn/shiip/public-api';

  if (!token) {
    console.error('[Sync] Error: GHN_TOKEN is not configured in environment.');
    return;
  }

  console.log(`[Sync] Starting GHN orders sync for Shop: ${shopId}...`);

  try {
    // 1. Read existing local database
    let existingOrders = [];
    try {
      const dataStr = await readFile(filePath, 'utf8');
      existingOrders = JSON.parse(dataStr);
    } catch (err) {
      console.log('[Sync] No existing ghn_orders.json found or failed to parse. Starting fresh.');
    }

    // Map existing orders by order_code for O(1) lookup
    const orderMap = new Map();
    existingOrders.forEach((order, index) => {
      if (order.order_code) {
        orderMap.set(order.order_code, index);
      }
    });

    // 2. Fetch the 100 most recent orders from GHN search API
    // The search endpoint is under /v2/shipping-order/search
    const searchUrl = `${baseUrl.replace(/\/public-api$/, '')}/public-api/v2/shipping-order/search`;

    const response = await fetch(searchUrl, {
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

    let addedCount = 0;
    let updatedCount = 0;

    // 3. Merge fetched orders into local list
    for (const rawOrder of newOrders) {
      const orderCode = rawOrder.order_code;
      if (!orderCode) continue;

      if (orderMap.has(orderCode)) {
        const index = orderMap.get(orderCode);
        const existing = existingOrders[index];

        // Check if status or key fields changed to log updates
        if (
          existing.status !== rawOrder.status ||
          existing.cod_amount !== rawOrder.cod_amount ||
          existing.total_fee !== rawOrder.total_fee
        ) {
          existingOrders[index] = { ...existing, ...rawOrder };
          updatedCount++;
        }
      } else {
        // Add new order
        existingOrders.push(rawOrder);
        addedCount++;
      }
    }

    // 4. Sort consolidated order list descending by order_date or created_date
    existingOrders.sort((a, b) => {
      const dateA = new Date(a.order_date || a.created_date || 0);
      const dateB = new Date(b.order_date || b.created_date || 0);
      return dateB - dateA;
    });

    // 5. Write back to ghn_orders.json
    await writeFile(filePath, JSON.stringify(existingOrders, null, 2), 'utf8');

    console.log(`[Sync] Sync complete. Added: ${addedCount}, Updated: ${updatedCount}. Total orders in local DB: ${existingOrders.length}`);
  } catch (err) {
    console.error(`[Sync] Sync failed: ${err.message}`);
  }
}
