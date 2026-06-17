import test from 'node:test';
import assert from 'node:assert/strict';

import { runScheduledSync, triggerBuildHook } from '../netlify/functions/check-ghn-updates.js';

test('triggerBuildHook skips cleanly when NETLIFY_BUILD_HOOK_URL is missing', async () => {
  const originalHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  delete process.env.NETLIFY_BUILD_HOOK_URL;

  let fetchCalled = false;

  try {
    const result = await triggerBuildHook(async () => {
      fetchCalled = true;
      return { ok: true };
    });

    assert.deepEqual(result, {
      triggered: false,
      skipped: true,
      reason: 'missing_build_hook_url',
    });
    assert.equal(fetchCalled, false);
  } finally {
    if (originalHookUrl === undefined) {
      delete process.env.NETLIFY_BUILD_HOOK_URL;
    } else {
      process.env.NETLIFY_BUILD_HOOK_URL = originalHookUrl;
    }
  }
});

test('runScheduledSync returns success metadata when rebuild is needed but build hook is skipped', async () => {
  const result = await runScheduledSync({
    readCurrentOrders: async () => [{ order_code: 'A001', status: 'ready_to_pick', updated_date: '2026-06-17T01:00:00.000Z' }],
    readLatestOrders: async () => [{ order_code: 'A001', status: 'delivering', updated_date: '2026-06-17T02:00:00.000Z' }],
    triggerRebuild: async () => ({
      triggered: false,
      skipped: true,
      reason: 'missing_build_hook_url',
    }),
  });

  assert.equal(result.rebuildNeeded, true);
  assert.equal(result.rebuildTriggered, false);
  assert.equal(result.buildHookSkipped, true);
  assert.equal(result.buildHookReason, 'missing_build_hook_url');
  assert.equal(result.currentCount, 1);
  assert.equal(result.latestCount, 1);
});

test('runScheduledSync does not trigger a build hook when nothing meaningful changed', async () => {
  let triggerCalled = false;

  const result = await runScheduledSync({
    readCurrentOrders: async () => [{ order_code: 'A001', status: 'ready_to_pick', updated_date: '2026-06-17T01:00:00.000Z' }],
    readLatestOrders: async () => [{ order_code: 'A001', status: 'ready_to_pick', updated_date: '2026-06-17T01:00:00.000Z' }],
    triggerRebuild: async () => {
      triggerCalled = true;
      return { triggered: true, skipped: false, reason: null };
    },
  });

  assert.equal(result.rebuildNeeded, false);
  assert.equal(result.rebuildTriggered, false);
  assert.equal(result.buildHookSkipped, false);
  assert.equal(result.buildHookReason, null);
  assert.equal(triggerCalled, false);
});
