import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeOrdersSnapshot, syncGhnOrders } from '../src/sync.mjs';

test('mergeOrdersSnapshot updates an existing order when only updated_date changes', () => {
  const result = mergeOrdersSnapshot(
    [
      {
        order_code: 'A001',
        status: 'ready_to_pick',
        cod_amount: 0,
        total_fee: 15000,
        updated_date: '2026-06-17T01:00:00.000Z',
      },
    ],
    [
      {
        order_code: 'A001',
        status: 'ready_to_pick',
        cod_amount: 0,
        total_fee: 15000,
        updated_date: '2026-06-17T02:00:00.000Z',
      },
    ],
  );

  assert.equal(result.updatedCount, 1);
  assert.equal(result.addedCount, 0);
  assert.equal(result.orders[0].updated_date, '2026-06-17T02:00:00.000Z');
});

test('syncGhnOrders returns a skipped result when GHN credentials are missing', async () => {
  const result = await syncGhnOrders({
    env: {},
  });

  assert.deepEqual(result, {
    ok: false,
    skipped: true,
    reason: 'missing_ghn_credentials',
    detail: 'GHN_TOKEN is not configured in environment.',
  });
});
