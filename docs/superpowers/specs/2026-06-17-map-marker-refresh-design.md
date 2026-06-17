# Map Marker Refresh Design

Date: 2026-06-17
Project: Hannah Olala Tracking
Scope: Refresh the 3D human/truck markers and rewrite journey endpoint handling for a cleaner, more stable map UI.

## Goals

- Rebuild the existing 3D recipient and truck markers in a more modern, minimal style.
- Keep the map grounded in real tracking data while improving visual clarity.
- Make start/end handling more robust so route lines and markers align cleanly.
- Reduce overlap and visual jitter when current and destination points are close together.

## Non-goals

- Replacing Leaflet or the tile provider.
- Introducing external 3D libraries or canvas/WebGL rendering.
- Changing tracking APIs or the product-sync features.
- Reworking the entire timeline UI outside marker-related interactions.

## Current Problems

- The current recipient marker has too many tiny facial/body layers for its rendered size, so it reads as blurry instead of intentional.
- The truck marker is expressive but slightly imbalanced, with the cabin/cargo silhouette feeling busy at low zoom.
- Route start and end points are patched inline in map rendering, which makes the logic harder to reason about and reuse.
- When live points are near the destination, the markers and fitted bounds can feel cramped or visually stacked.

## Proposed Approach

### 1. Marker style refresh

Use the current HTML/CSS marker system, but simplify the models:

- Recipient marker:
  - Chibi-style but modern and minimal.
  - Larger head-to-body ratio, cleaner hair silhouette, fewer facial details.
  - Reduced limb layers so the figure reads clearly at 40-50px.
- Truck marker:
  - Stronger silhouette with clearer cabin, cargo box, wheels, and shadow.
  - Fewer decorative layers, better contrast between body panels, and more stable proportions.
- Keep the same `divIcon` architecture so the rest of the map system remains lightweight and Netlify-safe.

### 2. Journey normalization pipeline

Extract endpoint logic into a predictable pipeline before the map renders:

- `origin`:
  - Earliest reliable point from the journey source if present.
  - Otherwise fallback to the existing configured origin.
- `current`:
  - Latest event with valid coordinates.
  - Otherwise use the normalized origin.
- `destination`:
  - Final delivery point if valid.
  - Otherwise fallback to the configured destination.
- `routeStart` and `routeEnd`:
  - Derived from normalized `current` and `destination`.
  - Always snapped back onto the rendered polyline endpoints after routing.

This keeps data rules separate from visual rules and prevents map code from re-deciding the same state in multiple places.

### 3. Close-point handling

When `current` and `destination` are valid but too close to each other:

- Detect near-overlap using a small distance threshold.
- Avoid awkward `fitBounds` zoom jumps by switching to a close-range centered view.
- Apply a small visual separation strategy only for display if needed:
  - Prefer viewport and anchor adjustments first.
  - Use positional offset only when the markers would otherwise fully stack.

This preserves truthfulness while keeping the UI readable.

### 4. Marker anchoring and route alignment

- Standardize marker `iconSize`, `iconAnchor`, and `popupAnchor` for each model.
- Make route endpoint correction a single helper instead of repeated inline logic.
- Ensure the polyline visually connects to the marker base rather than appearing to enter the body/head of the model.

## Planned Code Changes

### `src/app.js`

- Rewrite `createTruckModelIcon()` markup to a cleaner minimal truck silhouette.
- Rewrite `createRecipientModelIcon()` markup to a simplified modern avatar.
- Add small helpers for:
  - normalized route endpoints
  - near-overlap detection
  - route endpoint snapping
  - display fitting strategy
- Refactor `renderRoadJourneyMap()` to consume normalized journey data instead of patching endpoints ad hoc.

### `src/mapJourney.mjs`

- Extend journey normalization if needed so `origin`, `current`, and `destination` are explicit and stable.
- Keep fallback behavior deterministic and easy to test.

### `styles.css`

- Replace the current truck/avatar layer definitions with simplified 3D CSS.
- Tune shadows, proportions, and contrast for map readability at small sizes.
- Add any minor classes needed for overlap-safe display variants.

### `tests/*.mjs`

- Add or update tests around:
  - normalized endpoint selection
  - fallback behavior when coordinates are missing
  - close-point handling rules
  - marker markup/style expectations if existing tests cover those surfaces

## Risks And Mitigations

- Risk: Simplifying the models too much makes them feel generic.
  - Mitigation: Keep a recognizable silhouette and layered highlights/shadows, just with fewer parts.
- Risk: Overlap handling could distort the perceived real location.
  - Mitigation: Only adjust display behavior after data normalization, and keep offsets minimal.
- Risk: Route refactor could regress current live-map behavior.
  - Mitigation: Preserve the current fetch and fallback flow, add tests for endpoint normalization, and verify both normal and collapsed routes.

## Verification Plan

- Run the existing Node test suite.
- Add targeted tests for journey normalization and edge cases.
- Manually verify:
  - a route with clear distance between current and destination
  - a route where current and destination are near each other
  - a route with missing intermediate coordinates
  - default idle map state still renders correctly

## Implementation Notes

- No external dependencies should be added.
- Keep the solution compatible with the existing static frontend + Netlify deployment model.
- Favor small helpers over large inlined branches inside map rendering.
