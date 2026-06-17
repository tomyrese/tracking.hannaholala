# Real Checkpoint Route Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hien thi day du cac chang nho co toa do that tren ban do, hien popup dia chi/kho ro rang, va doi mau tung segment theo tien do giao hang.

**Architecture:** Du lieu timeline van duoc tao o `src/trackingApi.mjs`, nhung se duoc lam giau them thong tin dia diem trong `detail`. `src/mapJourney.mjs` tiep tuc la lop chuyen doi du lieu map, tinh danh sach checkpoint/segment chi tu event co toa do that va danh dau segment `completed`, `active`, `upcoming`. `src/app.js` render route theo tung segment, bind popup marker, va ap dung he mau xanh nuoc nhat dan theo tien do.

**Tech Stack:** Vanilla JS, Node test runner, Leaflet, Netlify/static frontend

---

### Task 1: Add failing tests for real-checkpoint metadata and route progress

**Files:**
- Modify: `tests/mapJourney.test.mjs`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Write the failing test for preserving checkpoint detail from real events**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapJourney.test.mjs`
Expected: FAIL if checkpoint detail is not preserved as expected, or if the new assertion does not match current output.

- [ ] **Step 3: Write the failing test for route progress colors/state ordering**

```js
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
```

- [ ] **Step 4: Run test to verify both expectations fail correctly or expose the exact gap**

Run: `node --test tests/mapJourney.test.mjs`
Expected: FAIL on one of the new assertions if the current journey model is missing metadata/state behavior.

- [ ] **Step 5: Commit**

```bash
git add tests/mapJourney.test.mjs
git commit -m "test: cover real checkpoint metadata and route progress"
```

### Task 2: Make timeline event details carry real location/warehouse text

**Files:**
- Modify: `src/trackingApi.mjs`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Implement a helper that prefers explicit warehouse/location text when building event detail**

```js
function readLogDetail(log) {
  const locationParts = [
    log.updated_warehouse,
    log.warehouse,
    log.location,
    log.address,
  ].filter(Boolean);

  const messageParts = [
    log.note,
    log.reason,
    log.message,
    log.driver_name,
  ].filter(Boolean);

  return [...locationParts, ...messageParts].join(' · ');
}
```

- [ ] **Step 2: Keep the rest of `buildTimeline(order)` unchanged except for using the richer detail helper**

```js
push(readLogTitle(log), readLogTime(log), readLogDetail(log), lat, lng);
```

- [ ] **Step 3: Run the journey tests to verify metadata is now present without breaking ordering**

Run: `node --test tests/mapJourney.test.mjs`
Expected: PASS for the new detail assertions and all existing map journey tests.

- [ ] **Step 4: Commit**

```bash
git add src/trackingApi.mjs tests/mapJourney.test.mjs
git commit -m "feat: preserve warehouse detail in live timeline events"
```

### Task 3: Tighten journey modeling around real GPS checkpoints only

**Files:**
- Modify: `src/mapJourney.mjs`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Extend checkpoint objects with stable metadata while still filtering to real coordinates only**

```js
return {
  lat: point.lat,
  lng: point.lng,
  title: event.title || 'Cap nhat hanh trinh',
  time: event.time || '',
  detail: event.detail || '',
  timelineIndex,
  kind: 'event',
  isCurrent: timelineIndex === 0,
};
```

- [ ] **Step 2: Keep path construction limited to `origin`, real checkpoints, and `destination`**

```js
for (const checkpoint of [...eventCheckpoints].reverse()) {
  pushUniquePoint(pathPoints, checkpoint);
}
```

- [ ] **Step 3: Keep segment state calculation explicit and readable**

```js
for (let index = 0; index < pathPoints.length - 1; index += 1) {
  let status = 'upcoming';
  if (currentPathIndex === -1 || currentPathIndex === pathPoints.length - 1) {
    status = 'completed';
  } else if (index < currentPathIndex) {
    status = 'completed';
  } else if (index === currentPathIndex) {
    status = 'active';
  }

  segments.push({
    index,
    from: { lat: pathPoints[index].lat, lng: pathPoints[index].lng },
    to: { lat: pathPoints[index + 1].lat, lng: pathPoints[index + 1].lng },
    fromTimelineIndex: pathPoints[index].timelineIndex,
    toTimelineIndex: pathPoints[index + 1].timelineIndex,
    status,
  });
}
```

- [ ] **Step 4: Run the journey tests to verify the model stays deterministic**

Run: `node --test tests/mapJourney.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mapJourney.mjs tests/mapJourney.test.mjs
git commit -m "refactor: enrich real checkpoint journey metadata"
```

### Task 4: Add failing UI/source tests for blue-water route progression

**Files:**
- Modify: `tests/mapMarkers3d.test.mjs`
- Test: `tests/mapMarkers3d.test.mjs`

- [ ] **Step 1: Add source assertions for explicit segment state colors**

```js
test('segment route styles use a blue-water palette for upcoming, active, and completed progress', () => {
  assert.match(appSource, /color:\s*'#4da3ff'/);
  assert.match(appSource, /color:\s*'#1479ff'/);
  assert.match(appSource, /color:\s*'#b9dcff'/);
});
```

- [ ] **Step 2: Add a style/source assertion for checkpoint popups reusing real detail text**

```js
test('segmented journey binds popup text from checkpoint detail', () => {
  assert.match(appSource, /checkpoint\.detail/);
  assert.match(appSource, /checkpoint\.title/);
});
```

- [ ] **Step 3: Run the UI/source tests to verify they fail before implementation**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: FAIL on the new color or popup assertions.

- [ ] **Step 4: Commit**

```bash
git add tests/mapMarkers3d.test.mjs
git commit -m "test: cover blue route palette and checkpoint popup details"
```

### Task 5: Update route rendering to show real checkpoint progress on the map

**Files:**
- Modify: `src/app.js`
- Test: `tests/mapMarkers3d.test.mjs`

- [ ] **Step 1: Replace the current segment palette with the agreed blue-water progression**

```js
function getSegmentStyle(status) {
  if (status === 'completed') {
    return { color: '#b9dcff', weight: 4, opacity: 0.55 };
  }
  if (status === 'active') {
    return { color: '#1479ff', weight: 6, opacity: 0.96 };
  }
  return { color: '#4da3ff', weight: 4.5, opacity: 0.88 };
}
```

- [ ] **Step 2: Keep checkpoint markers bound only to real checkpoint objects and show full popup content**

```js
const popupText = [checkpoint.time, checkpoint.detail].filter(Boolean).join(' · ') || 'Cap nhat vi tri';
marker.bindPopup(`<b>${checkpoint.title}</b><br>${popupText}`);
```

- [ ] **Step 3: Ensure click-focus only targets timeline items with real map checkpoints**

```js
const checkpointEntry = checkpointMarkers.find((entry) => entry.timelineIndex === index);
if (!checkpointEntry) return;
```

- [ ] **Step 4: Keep the truck marker positioned at `journey.current` so the latest real GPS event stays authoritative**

```js
truckMarker = L.marker([journey.current.lat, journey.current.lng], {
  icon: truckIcon,
  zIndexOffset: 1000,
}).addTo(leafletMap);
```

- [ ] **Step 5: Run the UI/source tests to verify the new palette and popup wiring**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app.js tests/mapMarkers3d.test.mjs
git commit -m "feat: render real checkpoint route progress in blue palette"
```

### Task 6: Run full verification and capture any remaining gaps

**Files:**
- Verify: `tests/*.mjs`
- Verify: `src/trackingApi.mjs`
- Verify: `src/mapJourney.mjs`
- Verify: `src/app.js`

- [ ] **Step 1: Run the full automated test suite**

Run: `node --test tests/*.mjs`
Expected: `18/18` pass or higher if new tests were added.

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: Build completes. If `GHN_TOKEN is not configured in environment` still appears in the sync step, record it as an environment warning rather than a regression unless the exit code is non-zero.

- [ ] **Step 3: Review the diff for scope correctness**

Run: `git diff -- src/trackingApi.mjs src/mapJourney.mjs src/app.js tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs`
Expected: Diff only contains real-checkpoint detail enrichment, segment palette updates, and related tests.

- [ ] **Step 4: Commit**

```bash
git add src/trackingApi.mjs src/mapJourney.mjs src/app.js tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs
git commit -m "chore: finalize real checkpoint route progress update"
```
