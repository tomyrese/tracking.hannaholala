# Map Marker Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the recipient/truck 3D markers and normalize map endpoints so the tracking map looks cleaner and handles close start/end points more reliably.

**Architecture:** Keep the existing Leaflet + `divIcon` approach, but move endpoint normalization into focused helpers and simplify the marker DOM/CSS so it reads well at small sizes. Route snapping and close-point display rules are handled before final map fitting so the render code stays predictable.

**Tech Stack:** Vanilla JS modules, Leaflet, CSS marker layers, Node test runner

---

### Task 1: Add failing tests for journey normalization

**Files:**
- Modify: `tests/mapJourney.test.mjs`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('prefers the earliest reliable origin and latest live point for current', () => {
  const result = {
    from_location: { lat: '21.1', long: '105.8' },
    to_location: { lat: '10.8', long: '106.6' },
    events: [
      { title: 'Đang giao', lat: 10.95, lng: 106.72 },
      { title: 'Đã lấy hàng', lat: 11.02, lng: 106.68 },
      { title: 'Khởi tạo đơn hàng' },
    ],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.origin, { lat: 21.1, lng: 105.8 });
  assert.deepEqual(journey.current, { lat: 10.95, lng: 106.72 });
  assert.deepEqual(journey.destination, { lat: 10.8, lng: 106.6 });
});

test('marks near-overlap when current and destination are within a tiny distance threshold', () => {
  const result = {
    events: [{ title: 'Đang giao', lat: 10.80004, lng: 106.60003 }],
    to_location: { lat: 10.8, long: 106.6 },
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.equal(journey.isCollapsed, false);
  assert.equal(journey.isNearDestination, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapJourney.test.mjs`
Expected: FAIL because `isNearDestination` does not exist yet and current endpoint selection is not explicitly asserted.

- [ ] **Step 3: Write minimal implementation**

```js
const NEAR_DESTINATION_THRESHOLD = 0.0002;

function isNearPoint(a, b, threshold = NEAR_DESTINATION_THRESHOLD) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= threshold && Math.abs(a.lng - b.lng) <= threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mapJourney.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/mapJourney.test.mjs src/mapJourney.mjs
git commit -m "test: cover normalized map journey endpoints"
```

### Task 2: Normalize journey endpoints in the map helper

**Files:**
- Modify: `src/mapJourney.mjs`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('returns explicit route endpoints for display helpers', () => {
  const result = {
    from_location: { lat: 21.0285, long: 105.8542 },
    to_location: { lat: 10.8231, long: 106.6297 },
    events: [{ title: 'Đang giao', lat: 11.12, lng: 106.51 }],
  };

  const journey = buildMapJourney(result, { lat: 0, lng: 0 }, { lat: 1, lng: 1 });

  assert.deepEqual(journey.routeStart, journey.current);
  assert.deepEqual(journey.routeEnd, journey.destination);
  assert.match(journey.currentTitle, /Đang giao|Dang giao/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapJourney.test.mjs`
Expected: FAIL because `routeStart` and `routeEnd` are not returned yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function buildMapJourney(result, fallbackOrigin, fallbackDestination) {
  const origin = readLocationPoint(result?.from_location) || fallbackOrigin;
  const destination = readLocationPoint(result?.to_location) || fallbackDestination;
  const events = result?.events || [];

  let current = origin;
  let currentTitle = 'Vi tri gui hang (Hien tai)';

  for (const event of events) {
    const point = readEventPoint(event);
    if (point) {
      current = point;
      currentTitle = event.title || currentTitle;
      break;
    }
  }

  return {
    origin,
    current,
    currentTitle,
    destination,
    routeStart: current,
    routeEnd: destination,
    isCollapsed: current.lat === destination.lat && current.lng === destination.lng,
    isNearDestination: isNearPoint(current, destination),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mapJourney.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mapJourney.mjs tests/mapJourney.test.mjs
git commit -m "feat: normalize map journey endpoints"
```

### Task 3: Refresh 3D marker markup

**Files:**
- Modify: `src/app.js`
- Test: `tests/mapMarkers3d.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('map render uses refreshed 3d marker markup for truck and recipient', () => {
  const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(appJs, /map-model__vehicle-cab/);
  assert.match(appJs, /map-model__vehicle-trailer/);
  assert.match(appJs, /map-model__avatar-torso/);
  assert.match(appJs, /map-model__avatar-bob/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: FAIL because the new marker parts do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function createTruckModelIcon() {
  return createMapModelIcon({
    markup: `
      <div class="map-model map-model--truck map-truck-icon">
        <span class="map-model__shadow"></span>
        <div class="map-model__vehicle">
          <span class="map-model__vehicle-trailer"></span>
          <span class="map-model__vehicle-cab"></span>
          <span class="map-model__vehicle-window-band"></span>
          <span class="map-model__wheel map-model__wheel--rear"></span>
          <span class="map-model__wheel map-model__wheel--front"></span>
        </div>
      </div>
    `,
    size: 50,
    anchorX: 25,
    anchorY: 44,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/mapMarkers3d.test.mjs
git commit -m "feat: refresh 3d map marker markup"
```

### Task 4: Refresh marker CSS styling

**Files:**
- Modify: `styles.css`
- Test: `tests/mapMarkers3d.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('styles define refreshed truck and avatar layers', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.map-model__vehicle-cab/);
  assert.match(css, /\.map-model__vehicle-trailer/);
  assert.match(css, /\.map-model__avatar-torso/);
  assert.match(css, /\.map-model__avatar-bob/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: FAIL because the new CSS selectors do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```css
.map-model__vehicle-cab,
.map-model__vehicle-trailer,
.map-model__vehicle-window-band,
.map-model__avatar-bob,
.map-model__avatar-torso,
.map-model__avatar-legs,
.map-model__avatar-shoes {
  position: absolute;
  display: block;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mapMarkers3d.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add styles.css tests/mapMarkers3d.test.mjs
git commit -m "style: refresh 3d marker visuals"
```

### Task 5: Refactor map rendering to use normalized endpoints

**Files:**
- Modify: `src/app.js`
- Test: `tests/mapJourney.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('route snapping helper preserves exact marker endpoints', () => {
  const points = [
    [10.7, 106.5],
    [10.71, 106.51],
  ];

  const snapped = snapRouteEndpoints(points, { lat: 10.8, lng: 106.6 }, { lat: 10.9, lng: 106.7 });

  assert.deepEqual(snapped[0], [10.8, 106.6]);
  assert.deepEqual(snapped[snapped.length - 1], [10.9, 106.7]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mapJourney.test.mjs`
Expected: FAIL because `snapRouteEndpoints` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function snapRouteEndpoints(points, start, end) {
  const latLngs = points.length ? [...points] : [[start.lat, start.lng], [end.lat, end.lng]];
  latLngs[0] = [start.lat, start.lng];
  latLngs[latLngs.length - 1] = [end.lat, end.lng];
  return latLngs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mapJourney.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/mapJourney.test.mjs
git commit -m "refactor: align route endpoints to marker anchors"
```

### Task 6: Verify full map behavior

**Files:**
- Modify: `src/app.js`
- Modify: `src/mapJourney.mjs`
- Modify: `styles.css`
- Test: `tests/mapJourney.test.mjs`
- Test: `tests/mapMarkers3d.test.mjs`

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `node --test tests/*.mjs`
Expected: PASS with all suites green

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`
Expected: Build completes successfully; any existing GHN token warning remains non-blocking unless behavior changes.

- [ ] **Step 4: Manual verification checklist**

```text
1. Open the tracking page and submit a code with a visible live route.
2. Confirm the truck marker reads cleanly at normal zoom and does not look blurry.
3. Confirm the recipient marker remains legible at small size.
4. Confirm the blue route starts and ends exactly at the marker bases.
5. Confirm near-destination cases do not fully stack the two markers.
6. Confirm the idle map placeholder still appears before lookup.
```

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/mapJourney.mjs styles.css tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs
git commit -m "feat: refresh tracking map markers and route endpoints"
```
