# Single Captcha And Centered Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phone lookup require captcha only once per successful lookup session, stabilize map focus interactions for timeline checkpoints with real coordinates, and center the featured-product cards into an even 5-column desktop grid.

**Architecture:** Keep the backend captcha contract unchanged and store the latest validated captcha proof in the frontend session so detail views can reuse it after a successful phone lookup. Tighten the timeline-to-map binding so only real-coordinate events drive marker movement, while the product area switches to a fixed-column centered grid on desktop and preserves responsive behavior on smaller breakpoints.

**Tech Stack:** Vanilla JavaScript, CSS Grid, Node test runner (`node --test`)

---

## File Structure

- Modify: `D:\Work\HOtracking\src\app.js`
  - Add temporary frontend captcha-proof session state.
  - Reuse captcha proof for phone-search detail actions.
  - Restrict map-focus interactivity to timeline entries with real coordinates.
- Modify: `D:\Work\HOtracking\styles.css`
  - Center the 5-card featured product layout with fixed desktop columns and responsive fallbacks.
  - Add a non-interactive state for timeline items without real map coordinates.
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`
  - Lock in the new captcha reuse flow.
  - Lock in the map-interaction guard for real-coordinate items only.
  - Lock in the centered product-grid structure.

### Task 1: Lock the desired behavior with failing tests

**Files:**
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Write the failing test for single-captcha reuse after phone lookup**

```js
test('phone order detail buttons reuse the last captcha proof instead of reopening captcha', () => {
  assert.match(appSource, /let lastCaptchaProof = null;/);
  assert.match(appSource, /trackCurrentCode\(code,\s*\{\s*reuseLastCaptcha:\s*true\s*\}\)/);
  assert.match(appSource, /const shouldReuseCaptcha = Boolean\(options\.reuseLastCaptcha && lastCaptchaProof\);/);
});
```

- [ ] **Step 2: Write the failing test for map interactions only on real-coordinate events**

```js
test('timeline map focus only binds interactive behavior for events with real coordinates', () => {
  assert.match(appSource, /const items = timeline\.querySelectorAll\('\[data-timeline-event\]\[data-lat\]\[data-lng\]'\)/);
  assert.match(appSource, /const isMapInteractive = Boolean\(event\.lat && event\.lng\);/);
});
```

- [ ] **Step 3: Write the failing test for centered 5-column product layout**

```js
test('featured products use a centered five-column desktop grid', () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*184px\);/);
  assert.match(styles, /justify-content:\s*center;/);
});
```

- [ ] **Step 4: Run the test file to verify it fails for the expected missing behavior**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: FAIL with missing `lastCaptchaProof`, missing `reuseLastCaptcha`, missing `[data-lat][data-lng]` selector, and missing centered-grid rules.

- [ ] **Step 5: Commit the red test state**

```bash
git add tests/mapMarkers3d.test.mjs
git commit -m "test: capture captcha reuse and centered grid behavior"
```

### Task 2: Implement single-captcha reuse for phone lookup detail actions

**Files:**
- Modify: `D:\Work\HOtracking\src\app.js`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Add temporary captcha-proof session state near existing lookup state**

```js
let lastPhoneSearchResult = null;
let activeResultCode = '';
let lastCaptchaProof = null;
```

- [ ] **Step 2: Update the phone-order detail button handler to request proof reuse**

```js
buttons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const code = btn.getAttribute('data-code');
    trackCurrentCode(code, { reuseLastCaptcha: true });
  });
});
```

- [ ] **Step 3: Extend `trackCurrentCode` to reuse proof when the action comes from the freshly returned phone-order list**

```js
async function trackCurrentCode(codeOverride = '', options = {}) {
  const shouldReuseCaptcha = Boolean(options.reuseLastCaptcha && lastCaptchaProof);
  const captchaResult = shouldReuseCaptcha ? lastCaptchaProof : await askCaptcha();
  if (!captchaResult) return;

  lastCaptchaProof = captchaResult;
  // existing request logic continues unchanged
}
```

- [ ] **Step 4: Clear stale phone-search context only when the user leaves that order-list context, without dropping a still-valid proof too early**

```js
if (!isSamePhone && !isRelatedOrder) {
  lastPhoneSearchResult = null;
}
```

Keep the existing context-reset logic, but do not null out `lastCaptchaProof` inside the related-order flow so the detail button can reuse it.

- [ ] **Step 5: Run the focused test file to verify captcha reuse assertions pass**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: captcha-reuse assertions PASS, while map/grid assertions may still fail until later tasks land.

- [ ] **Step 6: Commit the captcha reuse slice**

```bash
git add src/app.js tests/mapMarkers3d.test.mjs
git commit -m "fix: reuse captcha proof for phone order detail views"
```

### Task 3: Stabilize checkpoint focus so only real-coordinate events drive the map

**Files:**
- Modify: `D:\Work\HOtracking\src\app.js`
- Modify: `D:\Work\HOtracking\styles.css`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Mark timeline rows as map-interactive only when both latitude and longitude exist**

```js
const isMapInteractive = Boolean(event.lat && event.lng);
const interactiveAttr = isMapInteractive ? ' data-map-interactive="true"' : '';

return `
  <li class="timeline__item${isMapInteractive ? '' : ' timeline__item--static'}" data-timeline-event${indexAttr}${latAttr}${lngAttr}${titleAttr}${interactiveAttr}>
```

- [ ] **Step 2: Bind timeline-to-map click handlers only for rows with real coordinates**

```js
function bindTimelineMapFocus() {
  const items = timeline.querySelectorAll('[data-timeline-event][data-lat][data-lng]');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      focusTimelineCheckpoint(Number(item.dataset.timelineIndex));
    });
  });
}
```

- [ ] **Step 3: Keep truck-marker movement anchored to the selected checkpoint marker**

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

- [ ] **Step 4: Add a visual non-interactive state for timeline rows without coordinates**

```css
.timeline__item--static {
  cursor: default;
}
```

- [ ] **Step 5: Run the focused test file to verify the map interaction assertions pass**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: map-interaction assertions PASS, product-grid assertions may still fail until Task 4 lands.

- [ ] **Step 6: Commit the map interaction slice**

```bash
git add src/app.js styles.css tests/mapMarkers3d.test.mjs
git commit -m "fix: limit map focus to real checkpoint coordinates"
```

### Task 4: Center and evenly align the featured product cards

**Files:**
- Modify: `D:\Work\HOtracking\styles.css`
- Test: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Replace the desktop product grid with fixed card columns centered in the available width**

```css
.featured-products__grid {
  display: grid;
  grid-template-columns: repeat(5, 184px);
  justify-content: center;
  gap: 8px;
  padding: 0 0 12px;
}
```

- [ ] **Step 2: Keep the card width aligned with the desktop grid column**

```css
.featured-products__card {
  width: 184px;
}
```

- [ ] **Step 3: Preserve responsive tablet/mobile behavior with smaller column counts**

```css
@media (max-width: 960px) {
  .featured-products__grid {
    grid-template-columns: repeat(3, 184px);
    justify-content: center;
  }
}

@media (max-width: 560px) {
  .featured-products__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 0 0 12px;
  }

  .featured-products__card {
    width: 100%;
  }
}
```

- [ ] **Step 4: Run the focused test file to verify all assertions pass**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: PASS for captcha reuse, map-focus guards, and centered-grid rules.

- [ ] **Step 5: Commit the layout slice**

```bash
git add styles.css tests/mapMarkers3d.test.mjs
git commit -m "style: center featured products into an even desktop grid"
```

### Task 5: Final verification and handoff

**Files:**
- Modify: `D:\Work\HOtracking\src\app.js`
- Modify: `D:\Work\HOtracking\styles.css`
- Modify: `D:\Work\HOtracking\tests\mapMarkers3d.test.mjs`

- [ ] **Step 1: Run the targeted regression test**

Run: `node --test tests/mapMarkers3d.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the broader project test suite if available**

Run: `npm test`

Expected: PASS, or document the exact command failure if no suite is configured.

- [ ] **Step 3: Review the git diff for only the intended files**

Run: `git diff -- src/app.js styles.css tests/mapMarkers3d.test.mjs`

Expected: only the single-captcha reuse flow, map-focus guard, and centered-grid changes.

- [ ] **Step 4: Commit the final integrated fix**

```bash
git add src/app.js styles.css tests/mapMarkers3d.test.mjs
git commit -m "fix: stabilize tracking detail flow and featured product layout"
```
