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

test('falls back to a direct line when the routing service fails', async () => {
  const route = await fetchRoadRoute(
    async () => ({ ok: false }),
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  );

  assert.deepEqual(route, [
    [10.5, 106.5],
    [10.8, 106.8],
  ]);
});
