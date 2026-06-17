import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const routeManagerSource = readFileSync(new URL('../src/TrackingRouteManager.mjs', import.meta.url), 'utf8');

test('map render uses emoji markers and the new tracking route manager', () => {
  assert.match(appSource, /createTrackingRouteManager/);
  assert.match(appSource, /emoji:\s*'🚚📦'/);
  assert.match(appSource, /emoji:\s*'🤵‍♂️'/);
  assert.match(appSource, /createDeliveredRecipientIcon/);
  assert.match(appSource, /let animFrameId = null;/);
  assert.doesNotMatch(appSource, /navigator\.geolocation/);
});

test('route manager exposes route generation, virtual points, marker states, and timeline sync helpers', () => {
  assert.match(routeManagerSource, /class TrackingRouteManager/);
  assert.match(routeManagerSource, /generateRoutePoints\(\)/);
  assert.match(routeManagerSource, /generateVirtualPoints\(/);
  assert.match(routeManagerSource, /moveVehicleToStep\(/);
  assert.match(routeManagerSource, /updateCompletedPath\(/);
  assert.match(routeManagerSource, /updateMarkerStates\(/);
  assert.match(routeManagerSource, /syncTimeline\(/);
  assert.match(routeManagerSource, /preventMarkerOverlap\(/);
});

test('route styles now keep full, completed, and remaining paths simultaneously', () => {
  assert.match(appSource, /function getRouteLineStyle\(kind\)/);
  assert.match(appSource, /color:\s*'#e7cfc4'/);
  assert.match(appSource, /color:\s*'#b79f95'/);
  assert.match(appSource, /color:\s*'#d89a83'/);
  assert.match(appSource, /fullRoutePolyline = L\.polyline/);
  assert.match(appSource, /completedRoutePolyline = L\.polyline/);
  assert.match(appSource, /remainingRoutePolyline = L\.polyline/);
});

test('timeline and marker focus are synchronized both ways through shared route state', () => {
  assert.match(appSource, /function updateTimelineState\(stepIndex\)/);
  assert.match(appSource, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/);
  assert.match(appSource, /marker\.on\('click', \(\) => focusTimelineCheckpoint\(timelineIndex\)\)/);
  assert.match(appSource, /originMarker\.on\('click'/);
  assert.match(appSource, /destinationMarker\.on\('click'/);
});

test('truck movement animates smoothly instead of teleporting between steps', () => {
  assert.match(appSource, /function animateMarkerTo\(marker,\s*targetPoint/);
  assert.match(appSource, /requestAnimationFrame\(tick\)/);
  assert.match(appSource, /duration = 1200/);
  assert.match(appSource, /const eased = 1 - \(\(1 - progress\) \*\* 3\)/);
});

test('styles define current, past, and future timeline states and dedicated map hint text', () => {
  assert.match(styles, /\.timeline__map-hint/);
  assert.match(styles, /\.timeline__item--past/);
  assert.match(styles, /\.timeline__item--current/);
  assert.match(styles, /\.timeline__item--future/);
  assert.match(styles, /\.map-emoji-marker--origin/);
});
