export function buildOsrmRouteUrl(points) {
  const encodedPoints = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`;
}

const VIETNAM_BOUNDS = {
  minLat: 8.1,
  maxLat: 23.9,
  minLng: 102.0,
  maxLng: 109.7,
};

function isPointInVietnam(lat, lng) {
  return (
    lat >= VIETNAM_BOUNDS.minLat &&
    lat <= VIETNAM_BOUNDS.maxLat &&
    lng >= VIETNAM_BOUNDS.minLng &&
    lng <= VIETNAM_BOUNDS.maxLng
  );
}

function routeLeavesVietnamMeaningfully(points) {
  let outsideCount = 0;
  let currentOutsideRun = 0;
  let longestOutsideRun = 0;

  for (const [lat, lng] of points) {
    if (isPointInVietnam(lat, lng)) {
      currentOutsideRun = 0;
      continue;
    }

    outsideCount += 1;
    currentOutsideRun += 1;
    longestOutsideRun = Math.max(longestOutsideRun, currentOutsideRun);
  }

  return outsideCount >= 3 || longestOutsideRun >= 2 || outsideCount / points.length > 0.35;
}

export async function fetchRoadRoute(fetchImpl, start, end) {
  const fallbackRoute = [
    [start.lat, start.lng],
    [end.lat, end.lng],
  ];

  if (!start || !end) {
    return fallbackRoute;
  }

  if (start.lat === end.lat && start.lng === end.lng) {
    return [[start.lat, start.lng]];
  }

  try {
    const response = await fetchImpl(buildOsrmRouteUrl([start, end]));
    if (!response.ok) {
      return fallbackRoute;
    }

    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return fallbackRoute;
    }

    const mappedCoordinates = coordinates.map(([lng, lat]) => [lat, lng]);
    if (routeLeavesVietnamMeaningfully(mappedCoordinates)) {
      return fallbackRoute;
    }

    return mappedCoordinates;
  } catch {
    return fallbackRoute;
  }
}
