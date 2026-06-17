import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimelineForDisplay } from '../src/trackingApi.mjs';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

test('buildTimeline removes noisy order-init and appointment-call events while keeping delivery milestones', () => {
  const events = buildTimelineForDisplay({
    status: 'delivering',
    updated_date: '2026-06-17T08:00:00.000Z',
    leadtime: '2026-06-17T09:00:00.000Z',
    finish_date: '2026-06-17T10:00:00.000Z',
    to_name: 'Thuy',
    order_date: '2026-06-16T08:00:00.000Z',
    log: [
      { status: 'delivered', updated_date: '2026-06-17T10:00:00.000Z', note: 'Nguoi nhan: Thuy' },
      { action: 'CALL', updated_date: '2026-06-17T09:55:00.000Z', note: 'Goi hen khach nhan hang' },
      { title: 'Khởi tạo đơn hàng', updated_date: '2026-06-16T08:00:00.000Z' },
      { status: 'delivering', updated_date: '2026-06-17T08:00:00.000Z', note: 'Dang giao' },
    ],
  });

  assert.equal(events.some((event) => /goi|hen/i.test(normalizeText(event.title)) || /goi|hen/i.test(normalizeText(event.detail))), false);
  assert.equal(events.some((event) => normalizeText(event.title).includes('khoi tao')), false);
  assert.equal(events.some((event) => normalizeText(event.title).includes('giao') && normalizeText(event.title).includes('thanh cong')), true);
  assert.equal(events.some((event) => normalizeText(event.title).includes('du kien giao hang')), true);
});

test('buildTimeline keeps only the newest delivered milestone when delivery completion appears multiple times', () => {
  const events = buildTimelineForDisplay({
    finish_date: '2026-06-17T10:00:00.000Z',
    to_name: 'Thuy',
    to_location: { lat: 10.8, long: 106.6 },
    log: [
      { status: 'delivered', updated_date: '2026-06-17T10:00:00.000Z', note: 'Nguoi nhan: Thuy' },
      { status: 'delivered', updated_date: '2026-06-17T09:59:00.000Z', note: 'Nguoi nhan: Cao Son' },
    ],
  });

  const deliveredEvents = events.filter((event) => normalizeText(event.title).includes('giao') && normalizeText(event.title).includes('thanh cong'));
  assert.equal(deliveredEvents.length, 1);
  assert.equal(deliveredEvents[0]?.detail.includes('Thuy'), true);
});
