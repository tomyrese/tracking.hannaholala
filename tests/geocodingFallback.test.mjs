import test from 'node:test';
import assert from 'node:assert/strict';
import { findCoordinatesByWardOrDistrict, trackShipment } from '../src/trackingApi.mjs';
import { findCoordinatesByWardOrDistrict as findCoordinatesByWardOrDistrictTrack } from '../netlify/functions/track.js';

const mockOrders = [
  {
    from_ward_code: '12345',
    from_district_id: 111,
    from_location: { lat: 10.1, long: 106.1 },
    to_ward_code: '67890',
    to_district_id: 222,
    to_location: { lat: 10.2, lng: 106.2 }
  },
  {
    from_ward_code: '54321',
    from_district_id: 333,
    from_location: { lat: 10.3, lng: 106.3 },
    to_ward_code: '09876',
    to_district_id: 444,
    to_location: { lat: 10.4, long: 106.4 }
  }
];

test('findCoordinatesByWardOrDistrict no longer maps ward codes to borrowed coordinates', () => {
  const coord1 = findCoordinatesByWardOrDistrict(mockOrders, '12345', null);
  const coord2 = findCoordinatesByWardOrDistrict(mockOrders, '09876', null);

  assert.equal(coord1, null);
  assert.equal(coord2, null);
});

test('findCoordinatesByWardOrDistrict no longer maps district ids to borrowed coordinates', () => {
  const coord1 = findCoordinatesByWardOrDistrict(mockOrders, null, 111);
  const coord2 = findCoordinatesByWardOrDistrict(mockOrders, '99999', 444);

  assert.equal(coord1, null);
  assert.equal(coord2, null);
});

test('findCoordinatesByWardOrDistrict returns null if no match found', () => {
  const coord = findCoordinatesByWardOrDistrict(mockOrders, '99999', 999);
  assert.equal(coord, null);
});

test('netlify track.js version of findCoordinatesByWardOrDistrict behaves identically', () => {
  const coord = findCoordinatesByWardOrDistrictTrack(mockOrders, '12345', null);
  assert.equal(coord, null);
});

test('trackShipment keeps missing live GHN coordinates as null instead of inferring them from ward or district', async () => {
  const oldToken = process.env.GHN_TOKEN;
  const oldShopId = process.env.GHN_SHOP_ID;
  process.env.GHN_TOKEN = 'mock-token';
  process.env.GHN_SHOP_ID = 'mock-shop-id';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          code: 200,
          message: 'Success',
          data: {
            order_code: 'NEW12345',
            status: 'ready_to_pick',
            from_ward_code: '21201',
            from_district_id: 1454,
            to_ward_code: '1A0711',
            to_district_id: 1493,
          }
        });
      }
    };
  };

  try {
    const result = await trackShipment('NEW12345');
    assert.equal(result.ok, true);
    assert.equal(result.type, 'live');

    assert.equal(result.from_location, null);
    assert.equal(result.to_location, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldToken === undefined) delete process.env.GHN_TOKEN;
    else process.env.GHN_TOKEN = oldToken;
    if (oldShopId === undefined) delete process.env.GHN_SHOP_ID;
    else process.env.GHN_SHOP_ID = oldShopId;
  }
});

test('trackShipment does not copy coordinates from a matching local order when the live GHN payload omits them', async () => {
  const oldToken = process.env.GHN_TOKEN;
  const oldShopId = process.env.GHN_SHOP_ID;
  process.env.GHN_TOKEN = 'mock-token';
  process.env.GHN_SHOP_ID = 'mock-shop-id';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async text() {
      return JSON.stringify({
        code: 200,
        message: 'Success',
        data: {
          order_code: 'GYHTE6W9',
          client_order_code: 'HO1743654',
          status: 'delivering',
        },
      });
    },
  });

  try {
    const result = await trackShipment('HO1743654');
    assert.equal(result.ok, true);
    assert.equal(result.type, 'live');
    assert.equal(result.from_location, null);
    assert.equal(result.to_location, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldToken === undefined) delete process.env.GHN_TOKEN;
    else process.env.GHN_TOKEN = oldToken;
    if (oldShopId === undefined) delete process.env.GHN_SHOP_ID;
    else process.env.GHN_SHOP_ID = oldShopId;
  }
});
