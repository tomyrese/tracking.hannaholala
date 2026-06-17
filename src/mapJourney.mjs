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

function isSamePoint(a, b) {
  return !!a && !!b && a.lat === b.lat && a.lng === b.lng;
}

function dedupeCheckpoints(checkpoints) {
  const unique = [];

  for (const checkpoint of checkpoints) {
    const last = unique[unique.length - 1];
    if (!last || !isSamePoint(last, checkpoint)) {
      unique.push(checkpoint);
    }
  }

  return unique;
}

function pushUniquePoint(points, point) {
  if (!point) return;
  const last = points[points.length - 1];
  if (!last || last.lat !== point.lat || last.lng !== point.lng) {
    points.push(point);
  }
}

export function buildMapJourney(result, fallbackOrigin, fallbackDestination) {
  const events = result?.events || [];
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

  const origin =
    readLocationPoint(result?.from_location) ||
    eventCheckpoints.at(-1) ||
    fallbackOrigin;
  const destination =
    readLocationPoint(result?.to_location) ||
    eventCheckpoints[0] ||
    fallbackDestination;
  const currentCheckpoint = eventCheckpoints[0] || null;
  const current = currentCheckpoint || origin;
  const currentTitle = currentCheckpoint?.title || 'Vi tri gui hang (Hien tai)';

  const pathPoints = [];
  pushUniquePoint(pathPoints, origin ? { ...origin, kind: 'origin', timelineIndex: null, title: 'Diem gui hang' } : null);

  for (const checkpoint of [...eventCheckpoints].reverse()) {
    pushUniquePoint(pathPoints, checkpoint);
  }

  pushUniquePoint(pathPoints, destination ? { ...destination, kind: 'destination', timelineIndex: null, title: 'Diem nhan hang' } : null);

  const currentPathIndex = pathPoints.findIndex((point) => point.lat === current.lat && point.lng === current.lng);
  const segments = [];

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const from = pathPoints[index];
    const to = pathPoints[index + 1];
    if (isSamePoint(from, to)) continue;

    let status = 'upcoming';
    if (currentPathIndex === -1 || currentPathIndex === pathPoints.length - 1) {
      status = 'completed';
    } else if (index < currentPathIndex) {
      status = 'completed';
    } else if (index === currentPathIndex) {
      status = 'active';
    }

    segments.push({
      index: segments.length,
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
      fromTimelineIndex: from.timelineIndex,
      toTimelineIndex: to.timelineIndex,
      status,
    });
  }

  return {
    origin,
    current: current ? { lat: current.lat, lng: current.lng } : null,
    currentTitle,
    destination,
    routeStart: current ? { lat: current.lat, lng: current.lng } : null,
    routeEnd: destination ? { lat: destination.lat, lng: destination.lng } : null,
    isCollapsed: isSamePoint(current, destination),
    isNearDestination: isNearPoint(current, destination),
    currentCheckpoint,
    checkpoints: eventCheckpoints,
    pathPoints,
    segments,
  };
}
