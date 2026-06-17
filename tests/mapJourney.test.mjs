import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMapJourney } from '../src/mapJourney.mjs';

test('uses the newest event with coordinates as the current sender position', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Dang giao', lat: 10.6, lng: 106.6 },
      { title: 'Dang luan chuyen', lat: 10.4, lng: 106.4 },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.current, { lat: 10.6, lng: 106.6 });
  assert.deepEqual(journey.origin, { lat: 10.1, lng: 106.1 });
  assert.deepEqual(journey.destination, { lat: 10.9, lng: 106.9 });
  assert.deepEqual(journey.routeStart, { lat: 10.6, lng: 106.6 });
  assert.deepEqual(journey.routeEnd, { lat: 10.9, lng: 106.9 });
  assert.equal(journey.currentTitle, 'Dang giao');
  assert.equal(journey.isCollapsed, false);
  assert.equal(journey.isNearDestination, false);
  assert.equal(journey.checkpoints.length, 2);
  assert.equal(journey.segments.length, 3);
  assert.equal(journey.segments[0].status, 'completed');
  assert.equal(journey.segments[2].status, 'active');
});

test('falls back to origin when no event coordinates are available', () => {
  const result = {
    from_location: { lat: 11.1, long: 107.1 },
    to_location: { lat: 11.9, long: 107.9 },
    events: [
      { title: 'Khoi tao don hang', lat: null, lng: null },
      { title: 'Dang xu ly' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.current, { lat: 11.1, lng: 107.1 });
  assert.deepEqual(journey.destination, { lat: 11.9, lng: 107.9 });
  assert.deepEqual(journey.routeStart, { lat: 11.1, lng: 107.1 });
  assert.deepEqual(journey.routeEnd, { lat: 11.9, lng: 107.9 });
  assert.equal(journey.currentTitle, 'Vi tri gui hang (Hien tai)');
  assert.equal(journey.isNearDestination, false);
  assert.equal(journey.checkpoints.length, 0);
  assert.equal(journey.segments.length, 1);
  assert.equal(journey.segments[0].status, 'active');
});

test('marks the route as collapsed when current and destination are the same point', () => {
  const result = {
    from_location: { lat: 12.3, long: 108.3 },
    to_location: { lat: 12.3, long: 108.3 },
    events: [{ title: 'Giao thanh cong', lat: 12.3, lng: 108.3 }],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.isCollapsed, true);
  assert.equal(journey.isNearDestination, true);
  assert.equal(journey.segments.length, 0);
});

test('prefers the earliest reliable origin and latest live point for current', () => {
  const result = {
    from_location: { lat: '21.1', long: '105.8' },
    to_location: { lat: '10.8', long: '106.6' },
    events: [
      { title: 'Dang giao', lat: 10.95, lng: 106.72 },
      { title: 'Da lay hang', lat: 11.02, lng: 106.68 },
      { title: 'Khoi tao don hang' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.origin, { lat: 21.1, lng: 105.8 });
  assert.deepEqual(journey.current, { lat: 10.95, lng: 106.72 });
  assert.deepEqual(journey.destination, { lat: 10.8, lng: 106.6 });
  assert.deepEqual(journey.routeStart, { lat: 10.95, lng: 106.72 });
  assert.deepEqual(journey.routeEnd, { lat: 10.8, lng: 106.6 });
  assert.equal(journey.checkpoints[0].timelineIndex, 0);
  assert.equal(journey.checkpoints[1].timelineIndex, 1);
});

test('marks near-overlap when current and destination are within a tiny distance threshold', () => {
  const result = {
    events: [{ title: 'Dang giao', lat: 10.80004, lng: 106.60003 }],
    to_location: { lat: 10.8, long: 106.6 },
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.isCollapsed, false);
  assert.equal(journey.isNearDestination, true);
});

test('builds timeline checkpoints and marks the newest checkpoint segment as active', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Dang giao', lat: 10.8, lng: 106.8, time: '10:00' },
      { title: 'Da den kho trung chuyen', lat: 10.5, lng: 106.5, time: '09:00' },
      { title: 'Da lay hang', lat: 10.2, lng: 106.2, time: '08:00' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.pathPoints[0].kind, 'origin');
  assert.equal(journey.pathPoints.at(-1).kind, 'destination');
  assert.equal(journey.currentCheckpoint.timelineIndex, 0);
  assert.equal(journey.segments.filter((segment) => segment.status === 'completed').length, 3);
  assert.equal(journey.segments.filter((segment) => segment.status === 'active').length, 1);
  assert.deepEqual(journey.segments.at(-1).from, { lat: 10.8, lng: 106.8 });
  assert.deepEqual(journey.segments.at(-1).to, { lat: 10.9, lng: 106.9 });
});

test('keeps checkpoint detail for real coordinate events such as warehouse updates', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Luu kho', detail: 'Kho Ha Noi - Long Bien', lat: 10.6, lng: 106.6, time: '10:00' },
      { title: 'Dang luan chuyen', detail: 'Hub Bac Ninh', lat: 10.4, lng: 106.4, time: '09:00' },
      { title: 'Cap nhat van ban khong co GPS', detail: 'Chi co text' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.checkpoints.length, 2);
  assert.equal(journey.checkpoints[0].detail, 'Kho Ha Noi - Long Bien');
  assert.equal(journey.checkpoints[1].detail, 'Hub Bac Ninh');
});

test('marks only the newest real checkpoint segment as active while older route segments become completed', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Luu kho', detail: 'Kho Ha Noi', lat: 10.8, lng: 106.8, time: '10:00' },
      { title: 'Dang luan chuyen', detail: 'Hub Hai Duong', lat: 10.5, lng: 106.5, time: '09:00' },
      { title: 'Da lay hang', detail: 'Kho xuat phat', lat: 10.2, lng: 106.2, time: '08:00' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.segments.filter((segment) => segment.status === 'active').length, 1);
  assert.equal(journey.segments.filter((segment) => segment.status === 'completed').length, 3);
  assert.equal(journey.segments.filter((segment) => segment.status === 'upcoming').length, 0);
});

test('deduplicates repeated checkpoint coordinates before building segments', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Dang giao', lat: 10.8, lng: 106.8 },
      { title: 'Luu kho', lat: 10.8, lng: 106.8 },
      { title: 'Da lay hang', lat: 10.2, lng: 106.2 },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.checkpoints.length, 2);
  assert.equal(
    journey.segments.some((segment) => segment.from.lat === segment.to.lat && segment.from.lng === segment.to.lng),
    false,
  );
});

test('keeps the newest GPS-backed event as currentCheckpoint even if a newer text-only event exists', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Luu kho', detail: 'text only' },
      { title: 'Dang giao', lat: 10.8, lng: 106.8 },
      { title: 'Da lay hang', lat: 10.2, lng: 106.2 },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.currentCheckpoint.title, 'Dang giao');
  assert.deepEqual(journey.current, { lat: 10.8, lng: 106.8 });
});
