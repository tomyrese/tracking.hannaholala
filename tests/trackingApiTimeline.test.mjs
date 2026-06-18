import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimelineForDisplay } from '../src/trackingApi.mjs';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
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

test('buildTimeline compresses many GHN raw statuses into one event per shipping phase', () => {
  const events = buildTimelineForDisplay({
    status: 'delivering',
    updated_date: '2026-06-17T08:10:00.000Z',
    leadtime: '2026-06-17T09:00:00.000Z',
    log: [
      { status: 'picking', updated_date: '2026-06-16T07:00:00.000Z', driver_name: 'A' },
      { status: 'money_collect_picking', updated_date: '2026-06-16T07:05:00.000Z', driver_name: 'A' },
      { status: 'picked', updated_date: '2026-06-16T07:10:00.000Z', driver_name: 'A' },
      { status: 'storing', updated_date: '2026-06-16T08:00:00.000Z' },
      { status: 'transporting', updated_date: '2026-06-16T12:00:00.000Z' },
      { status: 'storing', updated_date: '2026-06-16T18:00:00.000Z' },
      { status: 'delivering', updated_date: '2026-06-17T08:00:00.000Z', note: 'Dang giao' },
      { status: 'money_collect_delivering', updated_date: '2026-06-17T08:10:00.000Z', note: 'Thu tien' },
    ],
  });

  const normalizedTitles = events.map((event) => normalizeText(event.title));
  assert.equal(normalizedTitles.filter((title) => title === 'da lay hang').length, 1);
  assert.equal(normalizedTitles.filter((title) => title.includes('luan chuyen')).length, 1);
  assert.equal(normalizedTitles.filter((title) => title.includes('dang giao')).length, 1);
});

test('buildTimeline hides leadtime after the order is already finished', () => {
  const events = buildTimelineForDisplay({
    status: 'delivered',
    updated_date: '2026-06-17T10:00:00.000Z',
    finish_date: '2026-06-17T10:00:00.000Z',
    leadtime: '2026-06-17T11:00:00.000Z',
    to_name: 'Thuy',
    log: [
      { status: 'picked', updated_date: '2026-06-16T07:10:00.000Z' },
      { status: 'transporting', updated_date: '2026-06-16T12:00:00.000Z' },
      { status: 'delivered', updated_date: '2026-06-17T10:00:00.000Z', note: 'Nguoi nhan: Thuy' },
    ],
  });

  assert.equal(events.some((event) => normalizeText(event.title).includes('du kien giao hang')), false);
});

test('buildTimeline keeps only the return flow once the order has entered return states', () => {
  const events = buildTimelineForDisplay({
    status: 'return',
    updated_date: '2026-06-17T10:00:00.000Z',
    leadtime: '2026-06-17T11:00:00.000Z',
    log: [
      { status: 'picked', updated_date: '2026-06-16T07:10:00.000Z' },
      { status: 'transporting', updated_date: '2026-06-16T12:00:00.000Z' },
      { status: 'delivery_fail', updated_date: '2026-06-17T08:00:00.000Z', reason: 'Khach hen lai' },
      { status: 'waiting_to_return', updated_date: '2026-06-17T08:30:00.000Z' },
      { status: 'return_transporting', updated_date: '2026-06-17T09:00:00.000Z' },
      { status: 'return', updated_date: '2026-06-17T10:00:00.000Z' },
    ],
  });

  const normalizedTitles = events.map((event) => normalizeText(event.title));
  assert.equal(normalizedTitles.some((title) => title.includes('du kien giao hang')), false);
  assert.equal(normalizedTitles.filter((title) => title.includes('tra')).length, 1);
});

test('buildTimelineForDisplay injects virtual placeholders for missing milestones on a fresh order', () => {
  const events = buildTimelineForDisplay({
    status: 'ready_to_pick',
    updated_date: '2026-06-18T10:00:00.000Z',
    leadtime: '2026-06-18T18:00:00.000Z',
  });

  assert.equal(events.length, 5);

  const titles = events.map(e => e.title);
  assert.deepEqual(titles, [
    'Dự kiến giao hàng',
    'Đang giao',
    'Đang luân chuyển',
    'Đã lấy hàng',
    'Chờ lấy hàng',
  ]);

  // Check that the ready step has the correct time
  const readyStep = events.find(e => e.title === 'Chờ lấy hàng');
  assert.ok(readyStep.time);

  // Check that the intermediate placeholder steps have empty times/details
  const pickedStep = events.find(e => e.title === 'Đã lấy hàng');
  assert.equal(pickedStep.time, '');
  assert.equal(pickedStep.detail, '');

  const transportingStep = events.find(e => e.title === 'Đang luân chuyển');
  assert.equal(transportingStep.time, '');
  assert.equal(transportingStep.detail, '');

  const deliveringStep = events.find(e => e.title === 'Đang giao');
  assert.equal(deliveringStep.time, '');
  assert.equal(deliveringStep.detail, '');

  // Check that the leadtime step has the correct expected delivery details
  const leadtimeStep = events.find(e => e.title === 'Dự kiến giao hàng');
  assert.ok(leadtimeStep.time);
  assert.equal(leadtimeStep.detail, 'Thời gian giao hàng dự kiến tới người nhận.');
});
