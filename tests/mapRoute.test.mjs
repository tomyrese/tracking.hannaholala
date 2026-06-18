import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoute,
  buildOsrmRouteUrl,
  fetchRoadRoute,
  fetchRoadRouteForPoints,
  isLandPoint,
  isPointInVietnamBounds,
} from '../src/mapRoute.mjs';

test('builds an OSRM route url using lng,lat order', () => {
  const url = buildOsrmRouteUrl([
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  ]);

  assert.equal(
    url,
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/106.5,10.5;106.8,10.8?overview=full&geometries=geojson',
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
  assert.equal(route.every(([lat, lng]) => isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng)), true);
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
  assert.equal(route.every(([lat, lng]) => isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng)), true);
});

test('preserves the full OSRM geometry when only a tiny minority of domestic points fall outside the land heuristic', async () => {
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

test('fetchRoadRouteForPoints uses OSRM waypoint routing when multiple anchors are provided', async () => {
  const route = await fetchRoadRouteForPoints(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.5, 10.5],
                  [107.1, 12.2],
                  [107.9, 14.6],
                  [108.3, 16.0],
                ],
              },
            },
          ],
        };
      },
    }),
    [
      { lat: 10.5, lng: 106.5 },
      { lat: 12.2, lng: 107.1 },
      { lat: 16.0, lng: 108.3 },
    ],
  );

  assert.deepEqual(route, [
    [10.5, 106.5],
    [12.2, 107.1],
    [14.6, 107.9],
    [16.0, 108.3],
  ]);
});

test('buildRoute falls back to a Vietnam land route when OSRM returns no usable geometry', async () => {
  const route = await buildRoute(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.7081402, 10.857213],
                ],
              },
            },
          ],
        };
      },
    }),
    [
      { lat: 10.857213, lng: 106.7081402 },
      { lat: 21.5927453, lng: 103.4238921 },
    ],
  );

  assert.equal(route.length > 2, true);
  assert.deepEqual(route[0], [10.857213, 106.7081402]);
  assert.deepEqual(route.at(-1), [21.5927453, 103.4238921]);
  assert.equal(route.every(([lat, lng]) => isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng)), true);
});

test('fetchRoadRouteForPoints still returns a visible route when OSRM throws for waypoint routing', async () => {
  const route = await fetchRoadRouteForPoints(
    async () => {
      throw new Error('timeout');
    },
    [
      { lat: 10.857213, lng: 106.7081402 },
      { lat: 11.12, lng: 106.71 },
      { lat: 21.0285, lng: 105.8542 },
    ],
  );

  assert.equal(route.length > 2, true);
  assert.deepEqual(route[0], [10.857213, 106.7081402]);
  assert.deepEqual(route.at(-1), [21.0285, 105.8542]);
  assert.equal(route.every(([lat, lng]) => isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng)), true);
});

test('isLandPoint rejects obvious sea points inside the broad Vietnam longitude/latitude region', () => {
  assert.equal(isLandPoint(16.2, 109.8), false);
  assert.equal(isLandPoint(18.3, 108.9), false);
});

test('falls back to a Vietnam land route for a Southern delivery (e.g. HCMC to Ca Mau) tracing the Mekong Delta', async () => {
  const route = await fetchRoadRoute(
    async () => ({ ok: false }),
    { lat: 10.8231, lng: 106.6297 }, // HCMC
    { lat: 9.176, lng: 105.15 }, // Ca Mau
  );

  assert.equal(route.length > 2, true);
  assert.deepEqual(route[0], [10.8231, 106.6297]);
  assert.deepEqual(route.at(-1), [9.176, 105.15]);
  assert.equal(route.every(([lat, lng]) => isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng)), true);
});
