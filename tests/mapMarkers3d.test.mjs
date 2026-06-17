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
});

test('styles define emoji marker chips and interactive checkpoint states', () => {
  assert.match(styles, /\.map-emoji-marker\b/);
  assert.match(styles, /\.map-emoji-marker--truck\b/);
  assert.match(styles, /\.map-emoji-marker--recipient\b/);
  assert.match(styles, /\.map-checkpoint-dot\b/);
  assert.match(styles, /\.timeline__item\[data-timeline-event\]\.active-event\b/);
});
