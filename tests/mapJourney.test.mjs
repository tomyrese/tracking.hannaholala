import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMapJourney } from '../src/mapJourney.mjs';
import { createTrackingRouteManager } from '../src/TrackingRouteManager.mjs';

test('buildMapJourney keeps origin and destination fixed while current follows the latest meaningful step', () => {
  const result = {
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Dang giao', lat: 10.8, lng: 106.8, time: '10:00' },
      { title: 'Dang luan chuyen', lat: 10.5, lng: 106.5, time: '09:00' },
      { title: 'Da lay hang', lat: 10.2, lng: 106.2, time: '08:00' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.origin, { lat: 10.1, lng: 106.1 });
  assert.deepEqual(journey.destination, { lat: 10.9, lng: 106.9 });
  assert.deepEqual(journey.current, { lat: 10.8, lng: 106.8 });
  assert.equal(journey.currentCheckpoint.title, 'Dang giao');
  assert.equal(journey.checkpoints.length, 3);
  assert.equal(journey.pathPoints[0].kind, 'origin');
  assert.equal(journey.pathPoints.at(-1).kind, 'destination');
});

test('route manager creates virtual points so text-only interactive steps stay clickable', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Giao thanh cong', detail: 'Nguoi nhan: A' },
      { title: 'Du kien giao hang' },
      { title: 'Dang giao', lat: 10.6, lng: 106.6 },
      { title: 'Khoi tao don hang', detail: 'Nguoi gui: WELLHOME - FFM' },
    ],
  });

  const timelineSteps = manager.syncTimeline(manager.activeStepIndex);
  assert.equal(timelineSteps.length >= 3, true);
  assert.equal(timelineSteps.every((step) => step.point && Number.isFinite(step.point.lat) && Number.isFinite(step.point.lng)), true);
  assert.equal(timelineSteps.some((step) => step.isVirtual), true);
});

test('route manager keeps only one delivered step even if source data repeats it', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Giao thanh cong', lat: 10.9, lng: 106.9, detail: 'Nguoi nhan: Lan' },
      { title: 'Giao hang thanh cong', lat: 10.9, lng: 106.9, detail: 'Nguoi nhan: Lan' },
      { title: 'Dang giao', lat: 10.8, lng: 106.8 },
    ],
  });

  const deliveredSteps = manager.timelineSteps.filter((step) => step.phase === 'delivered');
  assert.equal(deliveredSteps.length, 1);
});

test('completed and remaining paths are both preserved instead of removing the old route', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Du kien giao hang', lat: 10.7, lng: 106.7 },
      { title: 'Dang giao', lat: 10.6, lng: 106.6 },
      { title: 'Da lay hang', lat: 10.2, lng: 106.2 },
      { title: 'Khoi tao don hang' },
    ],
  });

  const pathState = manager.updateCompletedPath(1);
  assert.equal(pathState.full.length >= 4, true);
  assert.equal(pathState.completed.length >= 2, true);
  assert.equal(pathState.remaining.length >= 2, true);
});
