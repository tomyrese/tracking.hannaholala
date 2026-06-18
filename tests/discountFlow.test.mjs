import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrderDelayed } from '../src/reviewGateway.mjs';
import { handleDiscountRequest } from '../src/discountHandler.mjs';

test('isOrderDelayed correctly identifies late shipments', () => {
  const now = new Date();
  
  // Delivered - not delayed
  assert.equal(isOrderDelayed({
    ok: true,
    type: 'live',
    raw: {
      data: {
        leadtime: new Date(now - 6 * 86400000).toISOString(),
        status: 'delivered',
      }
    }
  }), false);

  // Storing & past leadtime (6 days ago) - delayed
  assert.equal(isOrderDelayed({
    ok: true,
    type: 'live',
    raw: {
      data: {
        leadtime: new Date(now - 6 * 86400000).toISOString(),
        status: 'storing',
      }
    }
  }), true);

  // Storing & past leadtime (4 days ago) - not delayed enough (needs 5 days)
  assert.equal(isOrderDelayed({
    ok: true,
    type: 'live',
    raw: {
      data: {
        leadtime: new Date(now - 4 * 86400000).toISOString(),
        status: 'storing',
      }
    }
  }), false);

  // Transporting & future leadtime - not delayed
  assert.equal(isOrderDelayed({
    ok: true,
    type: 'live',
    raw: {
      data: {
        leadtime: new Date(now.getTime() + 86400000).toISOString(),
        status: 'transporting',
      }
    }
  }), false);

  // Cancelled & past leadtime - not delayed
  assert.equal(isOrderDelayed({
    ok: true,
    type: 'live',
    raw: {
      data: {
        leadtime: new Date(now - 6 * 86400000).toISOString(),
        status: 'cancel',
      }
    }
  }), false);
});

test('handleDiscountRequest returns delayed status and claiming flows', async () => {
  const now = new Date();
  
  // 1. GET - check status for delayed order (not claimed)
  const responseCheck = await handleDiscountRequest({
    method: 'GET',
    query: { code: 'HO1743654' },
    env: {
      GOOGLE_REVIEW_WEB_APP_URL: 'https://script.google.com/macros/s/exec',
      GOOGLE_REVIEW_SHARED_SECRET: 'top-secret',
    },
    trackShipmentFn: async () => ({
      ok: true,
      type: 'live',
      code: 'GHN123456',
      clientOrderCode: 'HO1743654',
      status: 'storing',
      raw: {
        data: {
          leadtime: new Date(now - 6 * 86400000).toISOString(),
          status: 'storing',
          to_phone: '0909123456',
        }
      }
    }),
    fetchFn: async (url) => {
      assert.match(String(url), /action=check_discount/);
      assert.match(String(url), /tracking_code=HO1743654/);
      return {
        ok: true,
        async json() {
          return { ok: true, claimed: false };
        }
      };
    }
  });

  assert.equal(responseCheck.statusCode, 200);
  const dataCheck = JSON.parse(responseCheck.body);
  assert.equal(dataCheck.ok, true);
  assert.equal(dataCheck.delayed, true);
  assert.equal(dataCheck.claimed, false);

  // 2. POST - claim discount code
  let sheetLogged = false;
  const responseClaim = await handleDiscountRequest({
    method: 'POST',
    body: JSON.stringify({ trackingCode: 'HO1743654' }),
    env: {
      GOOGLE_REVIEW_WEB_APP_URL: 'https://script.google.com/macros/s/exec',
      GOOGLE_REVIEW_SHARED_SECRET: 'top-secret',
    },
    trackShipmentFn: async () => ({
      ok: true,
      type: 'live',
      code: 'GHN123456',
      clientOrderCode: 'HO1743654',
      status: 'storing',
      raw: {
        data: {
          leadtime: new Date(now - 6 * 86400000).toISOString(),
          status: 'storing',
          to_phone: '0909123456',
        }
      }
    }),
    fetchFn: async (url, options) => {
      if (options && options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.equal(body.action, 'claim_discount');
        assert.equal(body.tracking_code, 'HO1743654');
        assert.match(body.discount_code, /^BNB-HO1743654-/);
        sheetLogged = true;
        return {
          ok: true,
          async json() {
            return { ok: true, claimed: true, code: body.discount_code };
          }
        };
      } else {
        // First check
        assert.match(String(url), /action=check_discount/);
        return {
          ok: true,
          async json() {
            return { ok: true, claimed: false };
          }
        };
      }
    }
  });

  assert.equal(responseClaim.statusCode, 201);
  const dataClaim = JSON.parse(responseClaim.body);
  assert.equal(dataClaim.ok, true);
  assert.equal(dataClaim.claimed, true);
  assert.match(dataClaim.code, /^BNB-HO1743654-/);
  assert.equal(sheetLogged, true);
});
