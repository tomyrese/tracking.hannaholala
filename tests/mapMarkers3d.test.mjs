import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('map render uses emoji markers and removes browser geolocation dependency', () => {
  assert.match(appSource, /emoji:\s*'🚚'/);
  assert.match(appSource, /emoji:\s*'🤵‍♂️'/);
  assert.match(appSource, /createEmojiMarkerIcon/);
  assert.match(appSource, /renderSegmentedJourney/);
  assert.doesNotMatch(appSource, /navigator\.geolocation/);
  assert.match(appSource, /let animFrameId = null;/);
});

test('styles define emoji marker chips and interactive checkpoint states', () => {
  assert.match(styles, /\.map-emoji-marker\b/);
  assert.match(styles, /\.map-emoji-marker--truck\b/);
  assert.match(styles, /\.map-emoji-marker--recipient\b/);
  assert.match(styles, /\.map-checkpoint-dot\b/);
  assert.match(styles, /\.timeline__item\[data-timeline-event\]\.active-event\b/);
});

test('segment route styles use a blue-water palette for upcoming, active, and completed progress', () => {
  assert.match(appSource, /color:\s*'#2f9bff'/);
  assert.match(appSource, /color:\s*'#005fe0'/);
  assert.match(appSource, /color:\s*'#7fc2ff'/);
});

test('segmented journey binds popup text from checkpoint detail', () => {
  assert.match(appSource, /checkpoint\.detail/);
  assert.match(appSource, /checkpoint\.title/);
});

test('focusTimelineCheckpoint moves the truck marker to the selected real checkpoint', () => {
  assert.match(appSource, /function applyRouteFocus\(routeModel,\s*focusedTimelineIndex = null\)/);
  assert.match(appSource, /truckMarker\.setLatLng\(\[/);
  assert.match(appSource, /applyRouteFocus\(currentRouteModel,\s*index\)/);
});

test('map zoom is driven by the truck and recipient display points instead of old route bounds', () => {
  assert.match(appSource, /buildMarkerDisplayState/);
  assert.match(appSource, /buildViewportFocusPoints/);
  assert.match(appSource, /function fitMarkerViewport\(map,\s*markerDisplayState\)/);
  assert.match(appSource, /fitMarkerViewport\(leafletMap,\s*markerDisplayState\)/);
});

test('phone order detail buttons reuse the last captcha proof instead of reopening captcha', () => {
  assert.match(appSource, /let lastCaptchaProof = null;/);
  assert.match(appSource, /trackCurrentCode\(code,\s*\{\s*reuseLastCaptcha:\s*true\s*\}\)/);
  assert.match(appSource, /const shouldReuseCaptcha = Boolean\(options\.reuseLastCaptcha && lastCaptchaProof\);/);
});

test('timeline map focus only binds interactive behavior for events with real coordinates', () => {
  assert.match(appSource, /const isMapInteractive = Boolean\(event\.lat && event\.lng\);/);
  assert.match(appSource, /const items = timeline\.querySelectorAll\('\[data-timeline-event\]\[data-lat\]\[data-lng\]'\)/);
});

test('featured products use a centered five-column desktop grid', () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*184px\);/);
  assert.match(styles, /justify-content:\s*center;/);
});

test('destination marker stays on the recipient icon while truck focus only repositions the truck marker', () => {
  assert.match(appSource, /const recipientIcon = createEmojiMarkerIcon\(\{[^}]*className:\s*'map-emoji-marker--recipient'/);
  assert.match(appSource, /destinationMarker = L\.marker\(\[markerDisplayState\.recipientDisplayPoint\.lat,\s*markerDisplayState\.recipientDisplayPoint\.lng\], \{/);
  assert.match(appSource, /recipientDisplayPoint/);
  assert.match(appSource, /truckMarker\.setLatLng\(\[/);
  assert.doesNotMatch(appSource, /truckMarker\.setIcon\(recipientIcon\)/);
});

test('delivered map state swaps to a recipient-plus-package marker and removes the truck marker', () => {
  assert.match(appSource, /const deliveredRecipientIcon = createEmojiMarkerIcon\(\{[^}]*emoji:\s*'🤵‍♂️📦'/);
  assert.match(appSource, /const isDeliveredJourney = isDeliveredResult\(result,\s*journey\)/);
  assert.match(appSource, /icon:\s*isDeliveredJourney\s*\?\s*deliveredRecipientIcon\s*:\s*recipientIcon/);
  assert.match(appSource, /truckMarker = markerDisplayState\.truckDisplayPoint\s*\?/);
});

test('styles distinguish interactive and static timeline checkpoints', () => {
  assert.match(styles, /\.timeline__item\[data-map-interactive="true"\]::after/);
  assert.match(styles, /\.timeline__item--static\b/);
  assert.match(styles, /grid-column:\s*2/);
  assert.match(styles, /Bấm để xem trên bản đồ/);
});

test('route shape signatures support tuple coordinates returned by fetchRoadRoute', () => {
  assert.match(appSource, /function pointsSignature\(points\)/);
  assert.match(appSource, /Array\.isArray\(point\)/);
  assert.match(appSource, /const \[lat, lng\] = point/);
});
