# Vietnam Only Map Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent rendered map routes from crossing into non-Vietnam territory by falling back to an internal segment line whenever OSRM returns out-of-country geometry.

**Architecture:** Keep the change isolated to `fetchRoadRoute()` by validating returned geometry points against a Vietnam bounding region before the route reaches the Leaflet renderer. Preserve the existing fallback line behavior so higher layers do not need to branch on route validity.

**Tech Stack:** Vanilla JavaScript, Node test runner (`node --test`)

---

## File Structure

- Modify: `D:\Work\HOtracking\src\mapRoute.mjs`
- Modify: `D:\Work\HOtracking\tests\mapRoute.test.mjs`

### Task 1: Add failing route-boundary tests

**Files:**
- Modify: `D:\Work\HOtracking\tests\mapRoute.test.mjs`

- [ ] **Step 1: Write the failing out-of-country fallback test**

```js
test('falls back to a direct line when OSRM returns geometry outside Vietnam', async () => {
  const route = await fetchRoadRoute(
    async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              geometry: {
                coordinates: [
                  [106.5, 10.5],
                  [104.9, 11.4],
                  [106.8, 10.8],
                ],
              },
            },
          ],
        };
      },
    }),
    { lat: 10.5, lng: 106.5 },
    { lat: 10.8, lng: 106.8 },
  );

  assert.deepEqual(route, [
    [10.5, 106.5],
    [10.8, 106.8],
  ]);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/mapRoute.test.mjs`

Expected: FAIL because the route is still returned with the out-of-country midpoint.

### Task 2: Implement Vietnam-only route filtering

**Files:**
- Modify: `D:\Work\HOtracking\src\mapRoute.mjs`

- [ ] **Step 1: Add a Vietnam bounds helper**

```js
function isPointInVietnam(lat, lng) {
  return lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
}
```

- [ ] **Step 2: Reject OSRM geometry with out-of-country points**

```js
const mappedCoordinates = coordinates.map(([lng, lat]) => [lat, lng]);
if (mappedCoordinates.some(([lat, lng]) => !isPointInVietnam(lat, lng))) {
  return fallbackRoute;
}

return mappedCoordinates;
```

- [ ] **Step 3: Run GREEN**

Run: `node --test tests/mapRoute.test.mjs`

Expected: PASS

### Task 3: Final verification and push-ready state

**Files:**
- Modify: `D:\Work\HOtracking\src\mapRoute.mjs`
- Modify: `D:\Work\HOtracking\tests\mapRoute.test.mjs`

- [ ] **Step 1: Run combined regression**

Run: `node --test tests/mapRoute.test.mjs tests/mapJourney.test.mjs tests/mapMarkers3d.test.mjs`

Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: Build completes; note any external `GHN_TOKEN` warning separately.

- [ ] **Step 3: Commit**

```bash
git add src/mapRoute.mjs tests/mapRoute.test.mjs docs/superpowers/specs/2026-06-17-vietnam-only-map-routes-design.md docs/superpowers/plans/2026-06-17-vietnam-only-map-routes.md
git commit -m "fix: constrain map routes to vietnam"
```
