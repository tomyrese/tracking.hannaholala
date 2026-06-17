import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMarkerDisplayState,
  buildViewportFocusPoints,
} from '../src/mapViewport.mjs';

test('keeps truck and recipient markers pinned to their real coordinates even when the points nearly overlap', () => {
  const state = buildMarkerDisplayState(
    { lat: 21.603418, lng: 103.43056 },
    { lat: 21.60345, lng: 103.43048 },
  );

  assert.deepEqual(state.truckDisplayPoint, { lat: 21.603418, lng: 103.43056 });
  assert.deepEqual(state.recipientDisplayPoint, { lat: 21.60345, lng: 103.43048 });
  assert.equal(state.hasVisualSeparation, false);
});

test('keeps the real positions untouched when truck and recipient are already far apart', () => {
  const state = buildMarkerDisplayState(
    { lat: 10.857213, lng: 106.7081402 },
    { lat: 21.5927453, lng: 103.4238921 },
  );

  assert.deepEqual(state.truckDisplayPoint, { lat: 10.857213, lng: 106.7081402 });
  assert.deepEqual(state.recipientDisplayPoint, { lat: 21.5927453, lng: 103.4238921 });
  assert.equal(state.hasVisualSeparation, false);
});

test('viewport focus is driven by the truck and recipient markers only', () => {
  const focusPoints = buildViewportFocusPoints({
    truckDisplayPoint: { lat: 10.857213, lng: 106.7081402 },
    recipientDisplayPoint: { lat: 21.5927453, lng: 103.4238921 },
  });

  assert.deepEqual(focusPoints, [
    [10.857213, 106.7081402],
    [21.5927453, 103.4238921],
  ]);
});

test('delivered state keeps only the recipient marker visible on the map', () => {
  const state = buildMarkerDisplayState(
    { lat: 10.857213, lng: 106.7081402 },
    { lat: 10.857213, lng: 106.7081402 },
    { delivered: true },
  );

  assert.equal(state.truckDisplayPoint, null);
  assert.deepEqual(state.recipientDisplayPoint, { lat: 10.857213, lng: 106.7081402 });
  assert.equal(state.hasVisualSeparation, false);
});
