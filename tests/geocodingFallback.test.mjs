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

test('findCoordinatesByWardOrDistrict matches by ward code correctly', () => {
  const coord1 = findCoordinatesByWardOrDistrict(mockOrders, '12345', null);
  assert.ok(coord1);
  assert.equal(coord1.lat, 10.1);
  assert.equal(coord1.lng, 106.1);

  const coord2 = findCoordinatesByWardOrDistrict(mockOrders, '09876', null);
  assert.ok(coord2);
  assert.equal(coord2.lat, 10.4);
  assert.equal(coord2.lng, 106.4);
});

test('findCoordinatesByWardOrDistrict matches by district ID when ward code is missing or not found', () => {
  const coord1 = findCoordinatesByWardOrDistrict(mockOrders, null, 111);
  assert.ok(coord1);
  assert.equal(coord1.lat, 10.1);
  assert.equal(coord1.lng, 106.1);

  const coord2 = findCoordinatesByWardOrDistrict(mockOrders, '99999', 444);
  assert.ok(coord2);
  assert.equal(coord2.lat, 10.4);
  assert.equal(coord2.lng, 106.4);
});

test('findCoordinatesByWardOrDistrict returns null if no match found', () => {
  const coord = findCoordinatesByWardOrDistrict(mockOrders, '99999', 999);
  assert.equal(coord, null);
});

test('netlify track.js version of findCoordinatesByWardOrDistrict behaves identically', () => {
  const coord = findCoordinatesByWardOrDistrictTrack(mockOrders, '12345', null);
  assert.ok(coord);
  assert.equal(coord.lat, 10.1);
  assert.equal(coord.lng, 106.1);
});

test('trackShipment integrates geocoding fallback for live GHN API when coordinates are missing', async () => {
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
    
    assert.ok(result.from_location);
    assert.equal(result.from_location.lat, 10.857213);
    assert.equal(result.from_location.lng, 106.7081402);
    
    assert.ok(result.to_location);
    assert.equal(result.to_location.lat, 20.9983795);
    assert.equal(result.to_location.lng, 105.8161161);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldToken === undefined) delete process.env.GHN_TOKEN;
    else process.env.GHN_TOKEN = oldToken;
    if (oldShopId === undefined) delete process.env.GHN_SHOP_ID;
    else process.env.GHN_SHOP_ID = oldShopId;
  }
});

