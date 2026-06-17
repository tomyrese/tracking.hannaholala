import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('map render uses 3d marker markup for truck and recipient', () => {
  assert.match(appSource, /map-model map-model--truck/);
  assert.match(appSource, /map-model map-model--recipient/);
  assert.doesNotMatch(appSource, /map-model__pedestal/);
  assert.doesNotMatch(appSource, /map-model__pedestal-glow/);
  assert.match(appSource, /anchorX:\s*24/);
  assert.match(appSource, /anchorX:\s*25/);
  assert.match(appSource, /map-model__vehicle-trailer/);
  assert.match(appSource, /map-model__vehicle-cab/);
  assert.match(appSource, /map-model__vehicle-window-band/);
  assert.match(appSource, /map-model__vehicle-bumper-accent/);
  assert.match(appSource, /map-model__avatar-bob/);
  assert.match(appSource, /map-model__avatar-face/);
  assert.match(appSource, /map-model__avatar-torso/);
  assert.match(appSource, /map-model__avatar-legs/);
  assert.match(appSource, /map-model__avatar-shoes/);
});

test('styles define 3d marker layers and variants', () => {
  assert.match(styles, /\.map-model\b/);
  assert.doesNotMatch(styles, /\.map-model__pedestal\b/);
  assert.match(styles, /width:\s*50px/);
  assert.match(styles, /\.map-model__vehicle-trailer\b/);
  assert.match(styles, /\.map-model__vehicle-cab\b/);
  assert.match(styles, /\.map-model__vehicle-window-band\b/);
  assert.match(styles, /\.map-model__avatar-bob\b/);
  assert.match(styles, /\.map-model__avatar-face\b/);
  assert.match(styles, /\.map-model__avatar-torso\b/);
  assert.match(styles, /\.map-model__avatar-legs\b/);
  assert.match(styles, /\.map-model__avatar-shoes\b/);
  assert.match(styles, /\.map-model--truck\b/);
  assert.match(styles, /\.map-model--recipient\b/);
});
