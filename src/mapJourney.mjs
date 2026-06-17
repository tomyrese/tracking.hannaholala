function pickCoordinate(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readLocationPoint(location) {
  if (!location) return null;
  const lat = pickCoordinate(location.lat);
  const lng = pickCoordinate(location.long, pickCoordinate(location.lng));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function readEventPoint(event) {
  if (!event) return null;
  const lat = pickCoordinate(event.lat);
  const lng = pickCoordinate(event.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const NEAR_DESTINATION_THRESHOLD = 0.0002;

function isNearPoint(a, b, threshold = NEAR_DESTINATION_THRESHOLD) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= threshold && Math.abs(a.lng - b.lng) <= threshold;
}

export function buildMapJourney(result, fallbackOrigin, fallbackDestination) {
  const events = result?.events || [];
  const origin =
    readLocationPoint(result?.from_location) ||
    readEventPoint(events[events.length - 1]) ||
    fallbackOrigin;
  const destination =
    readLocationPoint(result?.to_location) ||
    readEventPoint(events[0]) ||
    fallbackDestination;

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
    isCollapsed:
      !!current &&
      !!destination &&
      current.lat === destination.lat &&
      current.lng === destination.lng,
    isNearDestination: isNearPoint(current, destination),
  };
}
