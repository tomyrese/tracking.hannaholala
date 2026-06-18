import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const routeManagerSource = readFileSync(new URL('../src/TrackingRouteManager.mjs', import.meta.url), 'utf8');

test('map render uses emoji markers and the new tracking route manager', () => {
  assert.match(appSource, /createTrackingRouteManager/);
  assert.match(appSource, /createVehicleMarkerIcon/);
  assert.match(appSource, /createRecipientMarkerIcon/);
  assert.match(appSource, /fetchRoadRouteForPoints/);
  assert.match(appSource, /createLogisticsNodeIcon/);
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

test('truck movement animates smoothly along the route without rotating the emoji glyph', () => {
  assert.match(appSource, /function animateMarkerAlongPath\(marker,\s*pathPoints/);
  assert.match(appSource, /requestAnimationFrame\(tick\)/);
  assert.match(appSource, /duration = 1200/);
  assert.match(appSource, /const eased = 1 - \(\(1 - progress\) \*\* 3\)/);
  assert.match(appSource, /setVehicleMarkerAngle\(marker,\s*getBearing/);
  assert.match(appSource, /map-emoji-marker__direction/);
  assert.doesNotMatch(appSource, /map-emoji-marker__glyph'\)\.style\.transform/);
});

test('delivered flow keeps separate logistics nodes and includes the truck retreat animation', () => {
  assert.match(appSource, /endNodeMarker = L\.marker/);
  assert.match(appSource, /icon:\s*createLogisticsNodeIcon\('start'\)/);
  assert.match(appSource, /icon:\s*createLogisticsNodeIcon\('end'\)/);
  assert.match(appSource, /retreatPath = routeModel\.manager\.getRouteSlice/);
  assert.match(appSource, /angleOffset:\s*180/);
});

test('styles define current, past, and future timeline states, direction arrow, receiver badge, and logistics nodes', () => {
  assert.match(styles, /\.timeline__map-hint/);
  assert.match(styles, /\.timeline__item--past/);
  assert.match(styles, /\.timeline__item--current/);
  assert.match(styles, /\.timeline__item--future/);
  assert.match(styles, /\.map-emoji-marker__direction/);
  assert.match(styles, /\.receiver-marker__box/);
  assert.match(styles, /\.map-route-node--start/);
  assert.match(styles, /\.map-route-node--end/);
});
