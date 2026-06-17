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

const VIETNAM_CORRIDOR = [
  { lat: 10.8231, lng: 106.6297 },
  { lat: 11.56, lng: 108.99 },
  { lat: 13.78, lng: 109.22 },
  { lat: 15.12, lng: 108.8 },
  { lat: 16.47, lng: 107.58 },
  { lat: 17.47, lng: 106.62 },
  { lat: 18.67, lng: 105.69 },
  { lat: 19.81, lng: 105.78 },
  { lat: 21.0285, lng: 105.8542 },
  { lat: 21.33, lng: 104.13 },
  { lat: 21.5927, lng: 103.4239 },
];

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

function buildVietnamFallbackRoute(start, end) {
  const directRoute = [
    [start.lat, start.lng],
    [end.lat, end.lng],
  ];

  if (!isPointInVietnam(start.lat, start.lng) || !isPointInVietnam(end.lat, end.lng)) {
    return directRoute;
  }

  const latSpan = Math.abs(end.lat - start.lat);
  const lngSpan = Math.abs(end.lng - start.lng);
  if (latSpan < 1.2 && lngSpan < 1.2) {
    return directRoute;
  }

  const minLat = Math.min(start.lat, end.lat);
  const maxLat = Math.max(start.lat, end.lat);

  const corridorStops = VIETNAM_CORRIDOR
    .filter((point) => point.lat > minLat + 0.25 && point.lat < maxLat - 0.25)
    .sort((a, b) => (start.lat <= end.lat ? a.lat - b.lat : b.lat - a.lat));

  return [
    [start.lat, start.lng],
    ...corridorStops.map((point) => [point.lat, point.lng]),
    [end.lat, end.lng],
  ];
}

export async function fetchRoadRoute(fetchImpl, start, end) {
  if (!start || !end) {
    return [];
  }

  if (start.lat === end.lat && start.lng === end.lng) {
    return [[start.lat, start.lng]];
  }

  const fallbackRoute = buildVietnamFallbackRoute(start, end);

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
