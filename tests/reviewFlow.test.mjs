import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  extractReviewIdentity,
  isDeliveredReviewableResult,
  validateReviewSubmission,
} from '../src/reviewGateway.mjs';
import { handleReviewRequest } from '../src/reviewHandler.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('review gateway recognizes delivered orders and derives one canonical review code per order', () => {
  const result = {
    ok: true,
    type: 'live',
    code: 'GHN123456',
    clientOrderCode: 'HO1743654',
    status: 'Giao thành công',
    raw: {
      data: {
        to_phone: '0909123456',
      },
    },
  };

  assert.equal(isDeliveredReviewableResult(result), true);
  assert.deepEqual(extractReviewIdentity(result), {
    trackingCode: 'HO1743654',
    orderCode: 'GHN123456',
    clientOrderCode: 'HO1743654',
    phone: '0909123456',
    status: 'Giao thành công',
  });
});

test('review submission validation accepts 0-5 stars and rejects invalid payloads', () => {
  assert.deepEqual(validateReviewSubmission({
    trackingCode: 'HO1743654',
    rating: 0,
    note: 'Khach da nhan du hang',
  }), {
    ok: true,
    trackingCode: 'HO1743654',
    rating: 0,
    note: 'Khach da nhan du hang',
  });

  assert.deepEqual(validateReviewSubmission({
    trackingCode: 'HO1743654',
    rating: 6,
    note: '',
  }).ok, false);
});

test('review handler returns reviewed state for delivered orders that already exist in Google Sheet', async () => {
  const response = await handleReviewRequest({
    method: 'GET',
    query: { code: 'HO1743654' },
    env: {
      GOOGLE_REVIEW_WEB_APP_URL: 'https://script.google.com/macros/s/review/exec',
      GOOGLE_REVIEW_SHARED_SECRET: 'top-secret',
    },
    trackShipmentFn: async () => ({
      ok: true,
      type: 'live',
      code: 'GHN123456',
      clientOrderCode: 'HO1743654',
      status: 'Giao thành công',
      raw: { data: { to_phone: '0909123456' } },
    }),
    fetchFn: async (url) => {
      assert.match(String(url), /action=status/);
      assert.match(String(url), /tracking_code=HO1743654/);
      return {
        ok: true,
        async json() {
          return { ok: true, reviewed: true };
        },
      };
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    delivered: true,
    reviewed: true,
    trackingCode: 'HO1743654',
    orderCode: 'GHN123456',
    clientOrderCode: 'HO1743654',
    phone: '0909123456',
    message: 'Đơn hàng này đã được đánh giá.',
  });
});

test('review handler rejects submissions for orders that are not delivered', async () => {
  let fetchCalled = false;
  const response = await handleReviewRequest({
    method: 'POST',
    body: JSON.stringify({
      trackingCode: 'HO1743654',
      rating: 5,
      note: 'Tot',
    }),
    env: {
      GOOGLE_REVIEW_WEB_APP_URL: 'https://script.google.com/macros/s/review/exec',
      GOOGLE_REVIEW_SHARED_SECRET: 'top-secret',
    },
    trackShipmentFn: async () => ({
      ok: true,
      type: 'live',
      code: 'GHN123456',
      clientOrderCode: 'HO1743654',
      status: 'Đang giao',
      raw: { data: { to_phone: '0909123456' } },
    }),
    fetchFn: async () => {
      fetchCalled = true;
      return {
        ok: true,
        async json() {
          return { ok: true };
        },
      };
    },
  });

  assert.equal(fetchCalled, false);
  assert.equal(response.statusCode, 409);
  assert.match(JSON.parse(response.body).message, /giao thành công/i);
});

test('tracking UI renders a dedicated review panel and submits through the review endpoint', () => {
  assert.match(html, /data-review-panel/);
  assert.match(appSource, /\/api\/submit-review/);
  assert.match(appSource, /Đơn hàng này đã được đánh giá\./);
  assert.match(styles, /\.review-panel/);
});
