import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const serverJs = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('critical user-facing Vietnamese copy is not mojibake in index.html', () => {
  assert.match(indexHtml, /Tra cứu trạng thái đơn hàng theo thời gian thực\./);
  assert.match(indexHtml, /Cuộn để thu phóng · Kéo để di chuyển/);
});

test('critical user-facing Vietnamese copy is not mojibake in map UI code', () => {
  assert.match(appJs, /Đang tải thư viện bản đồ/);
  assert.match(appJs, /Cuộn để thu phóng · Kéo để di chuyển/);
  assert.match(appJs, /Vị trí người đặt \(Điểm nhận\)/);
  assert.match(appJs, /Vị trí gửi hàng \(Hiện tại\)/);
});

test('server responses keep Vietnamese accents intact', () => {
  assert.match(serverJs, /API route không tồn tại\./);
  assert.match(serverJs, /Mã xác thực không chính xác hoặc đã hết hạn\./);
});
