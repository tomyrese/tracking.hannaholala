import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('tracking header renders back button and order code in separate layout containers', () => {
  assert.match(html, /<div class="status-actions">\s*<div data-back-btn-container><\/div>\s*<\/div>\s*<div class="status-code-wrap">\s*<span class="code-pill" data-status-code>/s);
});

test('tracking header styles keep actions and order code as independent blocks', () => {
  assert.match(styles, /\.status-actions\s*\{/);
  assert.match(styles, /\.status-code-wrap\s*\{/);
});
