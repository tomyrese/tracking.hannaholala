export function buildOsrmRouteUrl(points) {
  const encodedPoints = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`;
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

    return coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return fallbackRoute;
  }
}
