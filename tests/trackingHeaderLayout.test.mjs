import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('tracking header renders back button and order code in separate layout containers', () => {
  assert.match(html, /<div class="status-actions">\s*<div data-back-btn-container><\/div>\s*<\/div>\s*<div class="status-code-wrap">\s*<span class="code-pill" data-status-code>/s);
});

test('delivery estimate card sits between the search card and result grid', () => {
  assert.match(html, /<section class="search-card"[\s\S]*?<\/section>\s*<section class="delivery-estimate-card"[^>]*data-delivery-estimate[^>]*>[\s\S]*?<\/section>\s*<section class="result-grid" data-result-grid>/);
  assert.match(html, /data-delivery-estimate-label/);
  assert.match(html, /data-delivery-estimate-value/);
});

test('tracking header styles keep actions and order code as independent blocks', () => {
  assert.match(styles, /\.status-actions\s*\{/);
  assert.match(styles, /\.status-code-wrap\s*\{/);
});

test('delivery estimate card has dedicated styles for hidden and visible states', () => {
  assert.match(styles, /\.delivery-estimate-card\s*\{/);
  assert.match(styles, /\.delivery-estimate-card\[hidden\]\s*\{/);
  assert.match(styles, /\.delivery-estimate-card__value\s*\{/);
});

test('live tracking header shows the order code in the title area instead of repeating delivery status', () => {
  assert.match(appSource, /statusTitle\.textContent = isLive \? `Mã đơn \$\{preparedResult\.clientOrderCode \|\| preparedResult\.code\}`/);
  assert.match(appSource, /statusCode\.textContent = isLive \? '' : `Mã: \$\{preparedResult\.code\}`/);
  assert.match(styles, /\.code-pill:empty\s*\{/);
});

test('app source includes delivery estimate rendering with updating fallback', () => {
  assert.match(appSource, /function renderDeliveryEstimate\(/);
  assert.match(appSource, /leadtime_order\?\.to_estimate_date/);
  assert.match(appSource, /leadtime/);
  assert.match(appSource, /Đang cập nhật/);
});
