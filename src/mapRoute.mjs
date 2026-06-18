export const VIETNAM_ROUTE_BOUNDS = {
  minLat: 8.18,
  maxLat: 23.39,
  minLng: 102.14,
  maxLng: 109.46,
};

export const VIETNAM_MAP_BOUNDS = {
  southWest: [7.5, 101.5],
  northEast: [24.5, 110.5],
};

const VIETNAM_BACKBONE = [
  { lat: 9.176, lng: 105.15 },       // Ca Mau
  { lat: 9.29, lng: 105.72 },        // Bac Lieu
  { lat: 9.6, lng: 105.97 },         // Soc Trang
  { lat: 10.03, lng: 105.78 },       // Can Tho
  { lat: 10.25, lng: 105.96 },       // Vinh Long
  { lat: 10.37, lng: 106.36 },       // Tien Giang
  { lat: 10.52, lng: 106.41 },       // Long An
  { lat: 10.8231, lng: 106.6297 },   // TP.HCM
  { lat: 11.12, lng: 106.71 },       // Binh Duong
  { lat: 10.95, lng: 106.85 },       // Dong Nai
  { lat: 10.93, lng: 108.1 },        // Phan Thiet
  { lat: 12.24, lng: 109.19 },       // Nha Trang
  { lat: 13.78, lng: 109.22 },       // Quy Nhon
  { lat: 15.12, lng: 108.8 },        // Quang Ngai
  { lat: 16.07, lng: 108.22 },       // Da Nang
  { lat: 16.47, lng: 107.58 },       // Hue
  { lat: 17.47, lng: 106.62 },       // Quang Binh
  { lat: 18.67, lng: 105.69 },       // Vinh
  { lat: 19.81, lng: 105.78 },       // Thanh Hoa
  { lat: 21.0285, lng: 105.8542 },   // Ha Noi
  { lat: 21.59, lng: 103.42 },       // Dien Bien axis
];

const LAND_THRESHOLD = 1.15;

export function buildOsrmRouteUrl(points) {
  const encodedPoints = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `https://routing.openstreetmap.de/routed-car/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`;
}

function toPoint(value) {
  if (Array.isArray(value)) {
    const [lat, lng] = value;
    return { lat: Number(lat), lng: Number(lng) };
  }
  return { lat: Number(value?.lat), lng: Number(value?.lng) };
}

function toTuple(value) {
  const point = toPoint(value);
  return [point.lat, point.lng];
}

function hasFinitePoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

function normalizeRoutingPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map(toPoint)
    .filter(hasFinitePoint);
}

function distanceSquared(a, b) {
  const deltaLat = a.lat - b.lat;
  const deltaLng = a.lng - b.lng;
  return (deltaLat ** 2) + (deltaLng ** 2);
}

function distanceToSegment(point, start, end) {
  const dx = end.lat - start.lat;
  const dy = end.lng - start.lng;
  if (dx === 0 && dy === 0) return Math.sqrt(distanceSquared(point, start));

  const t = Math.max(0, Math.min(1, (((point.lat - start.lat) * dx) + ((point.lng - start.lng) * dy)) / ((dx * dx) + (dy * dy))));
  const projection = {
    lat: start.lat + (t * dx),
    lng: start.lng + (t * dy),
  };
  return Math.sqrt(distanceSquared(point, projection));
}

export function isPointInVietnamBounds(lat, lng) {
  return (
    lat >= VIETNAM_ROUTE_BOUNDS.minLat &&
    lat <= VIETNAM_ROUTE_BOUNDS.maxLat &&
    lng >= VIETNAM_ROUTE_BOUNDS.minLng &&
    lng <= VIETNAM_ROUTE_BOUNDS.maxLng
  );
}

export function isLandPoint(lat, lng) {
  if (!isPointInVietnamBounds(lat, lng)) return false;
  const point = { lat, lng };

  let nearest = Infinity;
  for (let index = 0; index < VIETNAM_BACKBONE.length - 1; index += 1) {
    const distance = distanceToSegment(point, VIETNAM_BACKBONE[index], VIETNAM_BACKBONE[index + 1]);
    nearest = Math.min(nearest, distance);
  }

  return nearest <= LAND_THRESHOLD;
}

function sanitizeRoutePoints(points) {
  const sanitized = [];

  for (const point of points) {
    const [lat, lng] = toTuple(point);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isPointInVietnamBounds(lat, lng)) continue;
    if (!isLandPoint(lat, lng)) continue;

    const last = sanitized[sanitized.length - 1];
    if (!last || last[0] !== lat || last[1] !== lng) {
      sanitized.push([lat, lng]);
    }
  }

  return sanitized;
}

function routeLeavesVietnamMeaningfully(points) {
  if (!Array.isArray(points) || !points.length) return true;

  let invalidCount = 0;
  let longestInvalidRun = 0;
  let currentInvalidRun = 0;

  for (const [lat, lng] of points) {
    const valid = isPointInVietnamBounds(lat, lng) && isLandPoint(lat, lng);
    if (valid) {
      currentInvalidRun = 0;
      continue;
    }

    invalidCount += 1;
    currentInvalidRun += 1;
    longestInvalidRun = Math.max(longestInvalidRun, currentInvalidRun);
  }

  const threshold = Math.min(25, Math.max(2, Math.round(points.length * 0.15)));
  return longestInvalidRun > threshold;
}

function findNearestBackboneIndex(point) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  VIETNAM_BACKBONE.forEach((candidate, index) => {
    const currentDistance = distanceSquared(point, candidate);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildVietnamFallbackRoute(start, end) {
  const startPoint = toPoint(start);
  const endPoint = toPoint(end);
  const startIndex = findNearestBackboneIndex(startPoint);
  const endIndex = findNearestBackboneIndex(endPoint);
  const step = startIndex <= endIndex ? 1 : -1;
  const route = [[startPoint.lat, startPoint.lng]];

  for (let index = startIndex; step > 0 ? index <= endIndex : index >= endIndex; index += step) {
    const candidate = VIETNAM_BACKBONE[index];
    if (isPointInVietnamBounds(candidate.lat, candidate.lng) && isLandPoint(candidate.lat, candidate.lng)) {
      const last = route[route.length - 1];
      if (!last || last[0] !== candidate.lat || last[1] !== candidate.lng) {
        route.push([candidate.lat, candidate.lng]);
      }
    }
  }

  const last = route[route.length - 1];
  if (!last || last[0] !== endPoint.lat || last[1] !== endPoint.lng) {
    route.push([endPoint.lat, endPoint.lng]);
  }

  return sanitizeRoutePoints(route);
}

function mergeRouteSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    for (const point of segment) {
      const last = merged[merged.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        merged.push(point);
      }
    }
  }
  return merged;
}

function buildVietnamFallbackRouteForPoints(points, fallbackRoute = []) {
  if (!Array.isArray(points) || points.length < 2) {
    return sanitizeRoutePoints(fallbackRoute);
  }

  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push(buildVietnamFallbackRoute(points[index], points[index + 1]));
  }

  const merged = mergeRouteSegments(segments);
  return merged.length >= 2 ? merged : sanitizeRoutePoints(fallbackRoute);
}

function ensureVisibleRoute(route, fallbackRoute) {
  const sanitizedRoute = sanitizeRoutePoints(route);
  if (sanitizedRoute.length >= 2) {
    return sanitizedRoute;
  }

  const sanitizedFallback = sanitizeRoutePoints(fallbackRoute);
  if (sanitizedFallback.length >= 2) {
    return sanitizedFallback;
  }

  return sanitizedRoute.length ? sanitizedRoute : sanitizedFallback;
}

export async function buildRoute(fetchImpl, points, fallbackRoute = []) {
  const routingPoints = normalizeRoutingPoints(points);
  const fallback = buildVietnamFallbackRouteForPoints(routingPoints, fallbackRoute);

  if (routingPoints.length < 2) {
    console.log('OSRM Response', null);
    console.log('Route Coordinates', []);
    console.log('Route Length', 0);
    return ensureVisibleRoute([], fallback);
  }

  const encodedPoints = routingPoints.map((point) => `${point.lng},${point.lat}`).join(';');
  
  const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';
  const origin = isBrowser ? (window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin) : '';

  const urls = [];
  if (isBrowser) {
    urls.push(`${origin}/api/route?points=${encodedPoints}`);
  }
  urls.push(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`);
  urls.push(`https://router.project-osrm.org/route/v1/driving/${encodedPoints}?overview=full&geometries=geojson`);

  for (const url of urls) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) {
        const routeData = await response.json();
        const coords = Array.isArray(routeData?.routes?.[0]?.geometry?.coordinates)
          ? routeData.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
          : [];

        console.log('OSRM Response', routeData);
        console.log('Route Coordinates', coords);
        console.log('Route Length', coords?.length ?? 0);

        if (coords.length >= 2 && !routeLeavesVietnamMeaningfully(coords)) {
          return ensureVisibleRoute(coords, fallback);
        }
      } else {
        console.log('OSRM Response', { ok: response.ok, status: response.status ?? null });
        console.log('Route Coordinates', []);
        console.log('Route Length', 0);
      }
    } catch (error) {
      console.error(error);
      console.log('OSRM Response', null);
      console.log('Route Coordinates', []);
      console.log('Route Length', 0);
    }
  }

  return ensureVisibleRoute([], fallback);
}

export async function fetchRoadRouteForPoints(fetchImpl, points, fallbackRoute = []) {
  return buildRoute(fetchImpl, points, fallbackRoute);
}

export async function fetchRoadRoute(fetchImpl, start, end) {
  if (!start || !end) return [];
  const fallbackRoute = buildVietnamFallbackRoute(start, end);
  return buildRoute(fetchImpl, [start, end], fallbackRoute);
}
