import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMarkerDisplayState,
  buildViewportFocusPoints,
} from '../src/mapViewport.mjs';

test('separates truck and recipient markers when they nearly overlap', () => {
  const state = buildMarkerDisplayState(
    { lat: 10.857213, lng: 106.70814 },
    { lat: 10.857213, lng: 106.70814 },
  );

  assert.notDeepEqual(state.truckDisplayPoint, state.recipientDisplayPoint);
  assert.equal(state.hasVisualSeparation, true);
});

test('keeps real positions untouched when truck and recipient are far apart', () => {
  const state = buildMarkerDisplayState(
    { lat: 10.857213, lng: 106.7081402 },
    { lat: 21.5927453, lng: 103.4238921 },
  );

  assert.deepEqual(state.truckDisplayPoint, { lat: 10.857213, lng: 106.7081402 });
  assert.deepEqual(state.recipientDisplayPoint, { lat: 21.5927453, lng: 103.4238921 });
  assert.equal(state.hasVisualSeparation, false);
});

test('viewport focus can include origin, truck, and recipient points together', () => {
  const focusPoints = buildViewportFocusPoints({
    originDisplayPoint: { lat: 10.1, lng: 106.1 },
    truckDisplayPoint: { lat: 10.857213, lng: 106.7081402 },
    recipientDisplayPoint: { lat: 21.5927453, lng: 103.4238921 },
  });

  assert.deepEqual(focusPoints, [
    [10.1, 106.1],
    [10.857213, 106.7081402],
    [21.5927453, 103.4238921],
  ]);
});
