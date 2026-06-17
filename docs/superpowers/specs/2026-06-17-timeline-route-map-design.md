# Timeline Route Map Design

Date: 2026-06-17
Project: Hannah Olala Tracking
Scope: Replace the current 3D tracking map markers and route presentation with emoji-based markers and timeline-driven route segments.

## Goals

- Remove all browser geolocation usage from the tracking page.
- Use order data only to determine the route start and end points.
- Replace the current 3D truck and recipient models with lightweight icon markers:
  - `🚚` for the package / current transport position
  - `🤵‍♂️` for the recipient / delivery point
- Split the route into smaller visible segments based on timeline checkpoints.
- Show traveled route segments in a lighter color and the active/current segment more prominently.
- Let the user inspect smaller route sections through the timeline UI.

## Non-goals

- Replacing Leaflet.
- Adding a full playback animation system.
- Adding a new backend service or new external dependencies.
- Changing the product sync flow or unrelated homepage sections.

## Current Problems

- The map currently uses browser geolocation to influence view behavior, but the requested behavior should depend only on order data.
- The current 3D markers are heavier than needed and no longer match the preferred visual direction.
- The route is rendered as a single polyline, which hides the progression between timeline events.
- It is difficult to inspect individual route checkpoints or smaller route segments directly from the timeline.

## Proposed Approach

### 1. Source of truth for route endpoints

Route endpoints will come only from order data:

- `origin`:
  - Use `from_location` when available.
  - Otherwise use the earliest valid event checkpoint.
- `destination`:
  - Use `to_location` when available.
  - Otherwise use the latest valid delivery-side checkpoint.
- `current`:
  - Use the newest event with valid coordinates.
  - If no event has coordinates, fall back to `origin`.

Browser geolocation will be removed entirely from this map flow.

### 2. Emoji marker system

Replace the custom 3D HTML/CSS models with lightweight `divIcon` markers:

- Truck marker:
  - content: `🚚`
  - represents the latest known transport position
- Recipient marker:
  - content: `🤵‍♂️`
  - represents the delivery destination from order data

These markers should remain visually clean, centered, and easy to read at normal map zoom levels.

### 3. Timeline-driven checkpoint model

Each timeline event with valid coordinates becomes a checkpoint:

- checkpoints are ordered from newest to oldest according to the existing timeline ordering
- each checkpoint stores:
  - coordinates
  - title
  - time/detail text
  - timeline index

The route shown on the map is then built from these checkpoints plus normalized origin/destination endpoints when needed.

### 4. Segmented route rendering

Instead of one single route color:

- completed segments:
  - use a lighter, lower-emphasis color
- active/current segment:
  - use a stronger, darker color
- future/final remainder if applicable:
  - can use the same active styling or a medium-emphasis style, depending on available points

The segmentation should make it obvious which portions of the trip are already completed and where the truck currently is.

### 5. Timeline interaction

Timeline items should become stronger map controls:

- clicking a timeline event highlights the related checkpoint
- the map centers/fits to the selected checkpoint or adjacent route segment
- the selected route fragment becomes easier to inspect

This should work even if only some events have coordinates.

## Planned Code Changes

### `src/mapJourney.mjs`

- Add or extend helpers to build a normalized checkpoint list from:
  - `from_location`
  - `to_location`
  - timeline events with coordinates
- Return explicit route structures needed by the map:
  - `origin`
  - `destination`
  - `current`
  - `checkpoints`
  - `completedSegments`
  - `activeSegment`

### `src/app.js`

- Remove browser geolocation logic from the map flow.
- Replace 3D marker factories with emoji-based icon factories.
- Refactor route rendering to draw multiple polylines instead of one monolithic route.
- Connect timeline item clicks to checkpoint/segment focus on the map.
- Update truck icon placement whenever the newest valid event changes.

### `styles.css`

- Remove the now-unused 3D truck/recipient marker styling once the map no longer depends on it.
- Add light styling for emoji-based map markers if needed for readability:
  - background chip
  - shadow
  - border radius

### `tests/*.mjs`

- Update tests that currently expect 3D marker markup.
- Add or extend tests for:
  - no geolocation dependency
  - checkpoint extraction from timeline events
  - completed vs active route segmentation
  - emoji marker markup

## Risks And Mitigations

- Risk: Some timeline events may not contain coordinates.
  - Mitigation: Only create checkpoints for valid coordinate events and connect route logic with deterministic fallbacks.
- Risk: Segment rendering can become visually noisy if too many tiny segments are drawn.
  - Mitigation: Keep segment styling simple and highlight only the selected/current portion strongly.
- Risk: Removing geolocation changes the default zoom behavior.
  - Mitigation: Use route-based fit logic centered on origin, current, destination, and selected checkpoints.

## Verification Plan

- Run the existing Node test suite.
- Add targeted tests for checkpoint extraction and segmented routes.
- Manually verify:
  - route displays without browser location permission
  - truck icon appears at the newest valid checkpoint
  - recipient icon appears at the order destination
  - completed route appears lighter
  - clicking a timeline item focuses the related map area

## Implementation Notes

- Keep the implementation dependency-free and Netlify-safe.
- Favor focused helper functions for checkpoint normalization and route segmentation.
- Avoid embedding complex route state directly inside DOM event handlers.
