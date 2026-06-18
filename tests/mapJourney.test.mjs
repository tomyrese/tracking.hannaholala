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
  assert.deepEqual(journey.current, { lat: 10.1, lng: 106.1 });
  assert.equal(journey.currentCheckpoint.title, 'Dang giao');
  assert.equal(journey.checkpoints.length, 3);
});

test('timeline steps do not invent point coordinates before a real route geometry is assigned', () => {
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
  assert.equal(timelineSteps.every((step) => step.point === null), true);
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

test('setRouteGeometry keeps timeline steps without real coordinates unmapped', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Giao thanh cong' },
      { title: 'Du kien giao hang' },
      { title: 'Dang giao' },
      { title: 'Dang luan chuyen' },
      { title: 'Da lay hang' },
      { title: 'Khoi tao don hang' },
    ],
  });

  const routeGeometry = Array.from({ length: 101 }, (_, index) => ({
    lat: 10 + (index * 0.01),
    lng: 106 + (index * 0.005),
  }));

  manager.setRouteGeometry(routeGeometry);

  manager.stepsChronological.forEach((step) => {
    assert.equal(step.routeIndex ?? null, null);
    assert.equal(step.point, null);
    assert.equal(step.isRoutePoint, false);
  });
});

test('setRouteGeometry maps timeline steps to the nearest real checkpoint positions on the routed geometry', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.0, long: 106.0 },
    to_location: { lat: 10.4, long: 106.4 },
    events: [
      { title: 'Giao thanh cong', lat: 10.4, lng: 106.4, time: '12:00' },
      { title: 'Dang giao', lat: 10.31, lng: 106.31, time: '11:00' },
      { title: 'Dang luan chuyen', lat: 10.15, lng: 106.15, time: '10:00' },
      { title: 'Da lay hang', lat: 10.04, lng: 106.04, time: '09:00' },
      { title: 'Khoi tao don hang', lat: 10.0, lng: 106.0, time: '08:00' },
    ],
  });

  const routeGeometry = Array.from({ length: 41 }, (_, index) => ({
    lat: 10 + (index * 0.01),
    lng: 106 + (index * 0.01),
  }));

  manager.setRouteGeometry(routeGeometry);

  const expectedIndexes = [0, 4, 15, 31, 40];
  manager.stepsChronological.forEach((step, index) => {
    assert.equal(step.routeIndex, expectedIndexes[index]);
    assert.deepEqual(step.point, routeGeometry[expectedIndexes[index]]);
  });
});

test('generateAnchorPoints ignores clustered event coordinates when every event stays within 500 meters', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.0, long: 106.0 },
    to_location: { lat: 21.0, long: 105.8 },
    events: [
      { title: 'Dang giao', lat: 10.1010, lng: 106.1010, time: '12:00' },
      { title: 'Dang luan chuyen', lat: 10.1018, lng: 106.1015, time: '11:00' },
      { title: 'Da lay hang', lat: 10.1024, lng: 106.1020, time: '10:00' },
    ],
  });

  const stepAnchors = manager.routeAnchors.filter((anchor) => anchor.kind === 'step');
  assert.equal(stepAnchors.length, 0);
  assert.equal(manager.stepsChronological.every((step) => step.hasRealPoint === false), true);
});

test('completed and remaining paths are always slices of the main route geometry', () => {
  const manager = createTrackingRouteManager({
    from_location: { lat: 10.1, long: 106.1 },
    to_location: { lat: 10.9, long: 106.9 },
    events: [
      { title: 'Du kien giao hang' },
      { title: 'Dang giao' },
      { title: 'Da lay hang' },
      { title: 'Khoi tao don hang' },
    ],
  });

  const routeGeometry = Array.from({ length: 41 }, (_, index) => ({
    lat: 10 + (index * 0.02),
    lng: 106 + (index * 0.01),
  }));
  manager.setRouteGeometry(routeGeometry);

  const pathState = manager.updateCompletedPath(1);
  assert.deepEqual(pathState.full[0], [routeGeometry[0].lat, routeGeometry[0].lng]);
  assert.deepEqual(pathState.full.at(-1), [routeGeometry.at(-1).lat, routeGeometry.at(-1).lng]);
  assert.equal(pathState.completed.every(([lat, lng]) => routeGeometry.some((point) => point.lat === lat && point.lng === lng)), true);
  assert.equal(pathState.remaining.every(([lat, lng]) => routeGeometry.some((point) => point.lat === lat && point.lng === lng)), true);
});
