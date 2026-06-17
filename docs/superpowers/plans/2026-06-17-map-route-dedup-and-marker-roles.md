# Map Route Dedup And Marker Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove overlapping route segments, keep truck and recipient markers in fixed roles, and make interactive timeline checkpoints visually distinct from static timeline items.

**Architecture:** Tighten `buildMapJourney()` so it emits only meaningful checkpoint-to-checkpoint segments, then keep the Leaflet layer responsible for rendering a single deduplicated route sequence plus fixed marker roles. The timeline remains the source of interaction, but only GPS-backed events can drive map focus and receive interactive styling.

**Tech Stack:** Vanilla JavaScript, Leaflet, CSS, Node test runner (`node --test`)

---

## File Structure

- Modify: `D:\Work\HOtracking\src\mapJourney.mjs`
  - Deduplicate checkpoint coordinates before segment construction.
  - Ensure `currentCheckpoint` is always the newest GPS-backed event.
- Modify: `D:\Work\HOtracking\src\app.js`
  - Keep `truckMarker` and `destinationMarker` in separate fixed roles.
  - Deduplicate rendered segment polylines and refine focus behavior.
- Modify: `D:\Work\HOtracking\styles.css`
  - Add clearer visual differences for interactive vs static timeline items.
- Modify: `D:\Work\HOtracking\tests\mapJourney.test.mjs`
  - Lock in segment deduplication and current checkpoint behavior.
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`
  - Lock in fixed marker roles and interactive/static timeline styling hooks.

### Task 1: Add failing regression tests for map-journey deduplication

**Files:**
- Modify: `D:\Work\HOtracking\tests\mapJourney.test.mjs`
- Test: `D:\Work\HOtracking\tests\mapJourney.test.mjs`

- [ ] **Step 1: Write the failing checkpoint deduplication test**

```js
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
  assert.equal(journey.segments.some((segment) => segment.from.lat === segment.to.lat && segment.from.lng === segment.to.lng), false);
});
```

- [ ] **Step 2: Write the failing current-checkpoint test for non-GPS latest events**

```js
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
```

- [ ] **Step 3: Run the focused map-journey test file and verify RED**

Run: `node --test tests/mapJourney.test.mjs`

Expected: FAIL because repeated checkpoints are still preserved or zero-length segments are still possible.

### Task 2: Implement checkpoint and segment deduplication in `buildMapJourney`

**Files:**
- Modify: `D:\Work\HOtracking\src\mapJourney.mjs`
- Test: `D:\Work\HOtracking\tests\mapJourney.test.mjs`

- [ ] **Step 1: Add a checkpoint dedupe helper**

```js
function dedupeCheckpoints(checkpoints) {
  const unique = [];

  for (const checkpoint of checkpoints) {
    const last = unique[unique.length - 1];
    if (!last || !isNearPoint(last, checkpoint, 0)) {
      unique.push(checkpoint);
    }
  }

  return unique;
}
```

- [ ] **Step 2: Build `eventCheckpoints` through the dedupe helper**

```js
const eventCheckpoints = dedupeCheckpoints(
  events
    .map((event, timelineIndex) => {
      const point = readEventPoint(event);
      if (!point) return null;

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
    })
    .filter(Boolean),
);
```

- [ ] **Step 3: Skip zero-length segments while building the segment list**

```js
for (let index = 0; index < pathPoints.length - 1; index += 1) {
  const from = pathPoints[index];
  const to = pathPoints[index + 1];
  if (isSamePoint(from, to)) continue;

  segments.push({
    index: segments.length,
    from: { lat: from.lat, lng: from.lng },
    to: { lat: to.lat, lng: to.lng },
    fromTimelineIndex: from.timelineIndex,
    toTimelineIndex: to.timelineIndex,
    status,
  });
}
```

- [ ] **Step 4: Run the focused test file and verify GREEN**

Run: `node --test tests/mapJourney.test.mjs`

Expected: PASS for the new checkpoint/segment tests.

### Task 3: Add failing UI tests for fixed marker roles and clearer interactivity

**Files:**
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Write the failing marker-role test**

```js
test('destination marker stays on the recipient icon while truck focus only repositions the truck marker', () => {
  assert.match(appSource, /const recipientIcon = createEmojiMarkerIcon\(\{ emoji: '🤵‍♂️'/);
  assert.match(appSource, /destinationMarker = L\.marker\(\[journey\.destination\.lat, journey\.destination\.lng\], \{/);
  assert.match(appSource, /truckMarker\.setLatLng\(\[selectedLatLng\.lat, selectedLatLng\.lng\]\)/);
  assert.doesNotMatch(appSource, /truckMarker\.setIcon\(recipientIcon\)/);
});
```

- [ ] **Step 2: Write the failing interactive/static styling test**

```js
test('styles distinguish interactive and static timeline checkpoints', () => {
  assert.match(styles, /\.timeline__item\[data-map-interactive="true"\]::after/);
  assert.match(styles, /\.timeline__item--static\b/);
});
```

- [ ] **Step 3: Run the UI-focused test file and verify RED**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: FAIL because the new interactivity affordance selector does not exist yet.

### Task 4: Implement route-render deduplication and stronger interactive affordances

**Files:**
- Modify: `D:\Work\HOtracking\src\app.js`
- Modify: `D:\Work\HOtracking\styles.css`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Add a route-shape dedupe helper in `src/app.js`**

```js
function pointsSignature(points) {
  return points
    .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
    .join('|');
}
```

- [ ] **Step 2: Skip duplicate rendered polylines inside `renderSegmentedJourney`**

```js
const seenRouteShapes = new Set();

segmentPolylines = segmentRoutes
  .filter(({ points }) => {
    const signature = pointsSignature(points);
    if (seenRouteShapes.has(signature)) return false;
    seenRouteShapes.add(signature);
    return true;
  })
  .map(({ segment, points }) => {
```

- [ ] **Step 3: Keep marker roles fixed while focusing checkpoints**

```js
if (checkpointEntry) {
  if (truckMarker) {
    const selectedLatLng = checkpointEntry.marker.getLatLng();
    truckMarker.setLatLng([selectedLatLng.lat, selectedLatLng.lng]);
  }
  leafletMap.panTo(checkpointEntry.marker.getLatLng(), { animate: true, duration: 0.35 });
  checkpointEntry.marker.openPopup();
}
```

- [ ] **Step 4: Add a clearer interactive affordance to timeline items**

```css
.timeline__item[data-map-interactive="true"]::after {
  content: '• Bấm để xem trên bản đồ';
  display: block;
  margin-top: 6px;
  color: #9b6b5c;
  font-size: 11px;
  font-weight: 700;
}
```

- [ ] **Step 5: Soften static timeline items so they no longer look clickable**

```css
.timeline__item--static {
  cursor: default;
  opacity: .78;
}
```

- [ ] **Step 6: Run the UI-focused test file and verify GREEN**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: PASS for the marker-role and interactive/static affordance tests.

### Task 5: Final verification

**Files:**
- Modify: `D:\Work\HOtracking\src\mapJourney.mjs`
- Modify: `D:\Work\HOtracking\src\app.js`
- Modify: `D:\Work\HOtracking\styles.css`
- Modify: `D:\Work\HOtracking\tests\mapJourney.test.mjs`
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Run both focused regression suites**

Run: `node --test tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the local build**

Run: `npm run build`

Expected: build completes; note any external GHN token warning without treating it as a regression from this change set.

- [ ] **Step 3: Commit the integrated map fix**

```bash
git add src/mapJourney.mjs src/app.js styles.css tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs
git commit -m "fix: dedupe map routes and stabilize marker roles"
```
