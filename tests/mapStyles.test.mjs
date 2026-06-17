import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('leaflet overlay svg is not constrained by the global svg icon rule', () => {
  assert.match(
    styles,
    /\.leaflet-overlay-pane svg[^{]*\{[^}]*width:\s*auto\b[^}]*height:\s*auto\b[^}]*\}/s,
  );
});
