import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOsrmRouteUrl, fetchRoadRoute } from '../src/mapRoute.mjs';

test('builds an OSRM route url using lng,lat order', () => {
  const url = buildOsrmRouteUrl([
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  ]);

  assert.equal(
    url,
    'https://router.project-osrm.org/route/v1/driving/106.5,10.5;106.8,10.8?overview=full&geometries=geojson',
  );
});

test('returns OSRM road geometry when the routing service responds successfully', async () => {
  const route = await fetchRoadRoute(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.5, 10.5],
                  [106.65, 10.6],
                  [106.8, 10.8],
                ],
              },
            },
          ],
        };
      },
    }),
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  );

  assert.deepEqual(route, [
    [10.5, 106.5],
    [10.6, 106.65],
    [10.8, 106.8],
  ]);
});

test('falls back to a Vietnam-shaped route when the routing service fails for a long domestic trip', async () => {
  const route = await fetchRoadRoute(
    async () => ({ ok: false }),
    { lat: 10.857213, lng: 106.7081402 },
    { lat: 21.5927453, lng: 103.4238921 },
  );

  assert.equal(route.length > 2, true);
  assert.deepEqual(route[0], [10.857213, 106.7081402]);
  assert.deepEqual(route.at(-1), [21.5927453, 103.4238921]);
  assert.equal(route.some(([lat, lng]) => lat > 14 && lng > 107.5), true);
});

test('falls back to a Vietnam-shaped route when OSRM returns geometry outside Vietnam', async () => {
  const route = await fetchRoadRoute(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.5, 10.5],
                  [110.1, 19.8],
                  [110.3, 20.1],
                  [110.2, 20.4],
                  [106.8, 10.8],
                ],
              },
            },
          ],
        };
      },
    }),
    { lat: 10.857213, lng: 106.7081402 },
    { lat: 21.5927453, lng: 103.4238921 },
  );

  assert.equal(route.length > 2, true);
  assert.deepEqual(route[0], [10.857213, 106.7081402]);
  assert.deepEqual(route.at(-1), [21.5927453, 103.4238921]);
  assert.equal(route.some(([lat, lng]) => lat > 14 && lng > 107.5), true);
});

test('keeps a route when only a tiny minority of points fall just outside the Vietnam polygon', async () => {
  const route = await fetchRoadRoute(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.5, 10.5],
                  [106.55, 10.7],
                  [106.6, 10.9],
                  [105.95, 12.1],
                  [106.7, 11.2],
                  [106.8, 10.8],
                ],
              },
            },
          ],
        };
      },
    }),
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  );

  assert.deepEqual(route, [
    [10.5, 106.5],
    [10.7, 106.55],
    [10.9, 106.6],
    [12.1, 105.95],
    [11.2, 106.7],
    [10.8, 106.8],
  ]);
});
