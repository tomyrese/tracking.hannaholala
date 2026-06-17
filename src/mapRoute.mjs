export function buildOsrmRouteUrl(points) {
  const encodedPoints = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`;
}

const VIETNAM_POLYGON = [
  { lng: 102.1, lat: 23.4 },
  { lng: 103.4, lat: 22.7 },
  { lng: 104.9, lat: 22.5 },
  { lng: 106.2, lat: 23.3 },
  { lng: 107.5, lat: 23.4 },
  { lng: 108.7, lat: 21.9 },
  { lng: 109.4, lat: 18.5 },
  { lng: 109.3, lat: 15.0 },
  { lng: 109.1, lat: 12.0 },
  { lng: 108.6, lat: 10.2 },
  { lng: 107.8, lat: 8.6 },
  { lng: 106.4, lat: 8.5 },
  { lng: 105.5, lat: 9.3 },
  { lng: 105.6, lat: 10.8 },
  { lng: 106.0, lat: 12.2 },
  { lng: 106.0, lat: 13.7 },
  { lng: 105.6, lat: 15.2 },
  { lng: 105.2, lat: 16.7 },
  { lng: 104.7, lat: 18.5 },
  { lng: 104.3, lat: 20.0 },
  { lng: 103.6, lat: 21.3 },
  { lng: 102.7, lat: 22.5 },
];

function isPointInPolygon(lat, lng, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInVietnam(lat, lng) {
  return isPointInPolygon(lat, lng, VIETNAM_POLYGON);
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
    if (mappedCoordinates.some(([lat, lng]) => !isPointInVietnam(lat, lng))) {
      return fallbackRoute;
    }

    return mappedCoordinates;
  } catch {
    return fallbackRoute;
  }
}
