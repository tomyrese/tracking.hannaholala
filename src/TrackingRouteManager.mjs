const OVERLAP_THRESHOLD = 0.0002;
const OVERLAP_OFFSET = 0.00024;

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

function clonePoint(point) {
  return point ? { lat: point.lat, lng: point.lng } : null;
}

function pointsEqual(a, b) {
  return !!a && !!b && a.lat === b.lat && a.lng === b.lng;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}

function interpolatePoint(from, to, ratio) {
  return {
    lat: from.lat + ((to.lat - from.lat) * ratio),
    lng: from.lng + ((to.lng - from.lng) * ratio),
  };
}

function distanceBetween(a, b) {
  if (!a || !b) return 0;
  const deltaLat = b.lat - a.lat;
  const deltaLng = b.lng - a.lng;
  return Math.sqrt((deltaLat ** 2) + (deltaLng ** 2));
}

function quadraticBezier(start, control, end, t) {
  const inverse = 1 - t;
  return {
    lat: (inverse * inverse * start.lat) + (2 * inverse * t * control.lat) + (t * t * end.lat),
    lng: (inverse * inverse * start.lng) + (2 * inverse * t * control.lng) + (t * t * end.lng),
  };
}

function hashSeed(value) {
  const text = String(value || 'tracking-route');
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

function createRng(seedValue) {
  let state = hashSeed(seedValue) || 1;
  return () => {
    state += 0x6D2B79F5;
    let temp = state;
    temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function classifyTrackingEvent(event, index) {
  const title = String(event?.title || '');
  const text = normalizeText(title);

  if (!text) {
    return { phase: `misc-${index}`, rank: 50 + index, label: 'Cap nhat hanh trinh', interactive: false };
  }

  if (text.includes('giao thanh cong') || text.includes('giao hang thanh cong') || text.includes('delivered') || text.includes('da tra')) {
    return { phase: 'delivered', rank: 90, label: 'Giao thanh cong', interactive: true };
  }
  if (text.includes('du kien giao')) {
    return { phase: 'expected_delivery', rank: 80, label: 'Du kien giao hang', interactive: true };
  }
  if (text.includes('dang giao') && text.includes('thu tien')) {
    return { phase: 'out_for_delivery_cod', rank: 72, label: 'Dang giao (thu tien)', interactive: true };
  }
  if (text.includes('dang giao')) {
    return { phase: 'out_for_delivery', rank: 70, label: 'Dang giao', interactive: true };
  }
  if (text.includes('luan chuyen') || text.includes('van chuyen') || text.includes('trung chuyen')) {
    return { phase: 'linehaul', rank: 55, label: 'Dang luan chuyen', interactive: true };
  }
  if (text.includes('luu kho') || text.includes('kho')) {
    return { phase: 'warehouse', rank: 40, label: 'Luu kho', interactive: true };
  }
  if (text.includes('da lay hang')) {
    return { phase: 'picked_up', rank: 25, label: 'Da lay hang', interactive: true };
  }
  if (text.includes('dang lay hang') && text.includes('thu tien')) {
    return { phase: 'pickup_cod', rank: 22, label: 'Dang lay hang (thu tien)', interactive: true };
  }
  if (text.includes('dang lay hang')) {
    return { phase: 'picking_up', rank: 20, label: 'Dang lay hang', interactive: true };
  }
  if (text.includes('khoi tao don hang') || text.includes('tao don hang')) {
    return { phase: 'order_created', rank: 10, label: 'Khoi tao don hang', interactive: true };
  }
  if (text.includes('goi hen')) {
    return { phase: 'appointment', rank: 60, label: 'Goi hen', interactive: false };
  }

  return {
    phase: `misc-${index}`,
    rank: 50 + (index / 100),
    label: title,
    interactive: false,
  };
}

function enrichStepStates(steps, activeStepIndex) {
  return steps.map((step, index) => ({
    ...step,
    timelineState: index < activeStepIndex ? 'future' : index === activeStepIndex ? 'current' : 'past',
  }));
}

export class TrackingRouteManager {
  constructor(result, options = {}) {
    this.result = result || {};
    this.fallbackOrigin = options.fallbackOrigin || { lat: 21.0285, lng: 105.8542 };
    this.fallbackDestination = options.fallbackDestination || { lat: 10.8231, lng: 106.6297 };
    this.routeVariantSeed = options.routeVariantSeed || `${this.result?.clientOrderCode || this.result?.order_code || this.result?.code || 'tracking'}-${Date.now()}`;
    this.rng = createRng(this.routeVariantSeed);
    this.activeStepIndex = 0;
    this.model = this.generateRoutePoints();
  }

  generateRoutePoints() {
    const rawEvents = Array.isArray(this.result?.events) ? this.result.events : [];
    const originPoint =
      readLocationPoint(this.result?.from_location) ||
      readEventPoint(rawEvents.at(-1)) ||
      this.fallbackOrigin;
    const destinationPoint =
      readLocationPoint(this.result?.to_location) ||
      readEventPoint(rawEvents[0]) ||
      this.fallbackDestination;

    const selectedByPhase = new Map();
    rawEvents.forEach((event, rawIndex) => {
      const classification = classifyTrackingEvent(event, rawIndex);
      if (!classification.interactive) return;
      if (selectedByPhase.has(classification.phase)) return;

      selectedByPhase.set(classification.phase, {
        rawIndex,
        phase: classification.phase,
        rank: classification.rank,
        title: event?.title || classification.label,
        time: event?.time || '',
        detail: event?.detail || '',
        point: readEventPoint(event),
        hasRealPoint: Boolean(readEventPoint(event)),
      });
    });

    const stepsChronological = Array.from(selectedByPhase.values())
      .sort((a, b) => a.rank - b.rank)
      .map((step, stepIndex) => ({
        ...step,
        stepIndex,
      }));

    this.originPoint = clonePoint(originPoint);
    this.destinationPoint = clonePoint(destinationPoint);

    const virtualizedSteps = this.generateVirtualPoints(stepsChronological);
    const routeAnchors = this.generateAnchorPoints(virtualizedSteps);
    const visualRoute = this.generateVisualRoute(routeAnchors);

    this.stepsChronological = virtualizedSteps;
    this.timelineSteps = [...virtualizedSteps].sort((a, b) => b.stepIndex - a.stepIndex);
    this.activeStepIndex = virtualizedSteps.length ? virtualizedSteps.length - 1 : 0;

    const latestStep = virtualizedSteps.at(-1) || null;
    const delivered = latestStep?.phase === 'delivered';
    const currentPoint = latestStep?.point || originPoint;

    return {
      origin: clonePoint(originPoint),
      destination: clonePoint(destinationPoint),
      current: clonePoint(currentPoint),
      currentTitle: latestStep?.title || 'Vi tri xe hien tai',
      currentCheckpoint: latestStep,
      routePoints: routeAnchors,
      routeGeometry: visualRoute.points,
      routeGeometryByStep: visualRoute.routeIndexByStep,
      originRouteIndex: visualRoute.originRouteIndex,
      destinationRouteIndex: visualRoute.destinationRouteIndex,
      checkpoints: this.timelineSteps,
      stepsChronological: virtualizedSteps,
      isDelivered: delivered,
      isCollapsed: pointsEqual(currentPoint, destinationPoint),
      isNearDestination: this.isNearPoint(currentPoint, destinationPoint),
    };
  }

  generateVirtualPoints(steps) {
    if (!steps.length) return [];

    const filled = steps.map((step) => ({ ...step, point: step.point ? clonePoint(step.point) : null }));

    for (let index = 0; index < filled.length; index += 1) {
      if (filled[index].point) continue;

      let prevKnownIndex = index - 1;
      while (prevKnownIndex >= 0 && !filled[prevKnownIndex].point) prevKnownIndex -= 1;

      let nextKnownIndex = index + 1;
      while (nextKnownIndex < filled.length && !filled[nextKnownIndex].point) nextKnownIndex += 1;

      const fromPoint = prevKnownIndex >= 0 ? filled[prevKnownIndex].point : this.originPoint;
      const toPoint = nextKnownIndex < filled.length ? filled[nextKnownIndex].point : this.destinationPoint;
      const gapStart = prevKnownIndex + 1;
      const gapEnd = nextKnownIndex - 1;
      const gapLength = gapEnd - gapStart + 1;

      for (let gapOffset = 0; gapOffset < gapLength; gapOffset += 1) {
        const ratio = (gapOffset + 1) / (gapLength + 1);
        const targetIndex = gapStart + gapOffset;
        filled[targetIndex].point = interpolatePoint(fromPoint, toPoint, ratio);
        filled[targetIndex].isVirtual = true;
      }

      index = gapEnd;
    }

    return filled;
  }

  generateAnchorPoints(steps) {
    const anchors = [
      { kind: 'origin', point: clonePoint(this.originPoint), stepIndex: -1 },
      ...steps.map((step) => ({
        kind: 'step',
        point: clonePoint(step.point),
        stepIndex: step.stepIndex,
        phase: step.phase,
      })),
      { kind: 'destination', point: clonePoint(this.destinationPoint), stepIndex: steps.length },
    ];

    return anchors.filter((anchor, index, list) => index === 0 || !pointsEqual(anchor.point, list[index - 1].point));
  }

  generateVisualRoute(anchors) {
    if (!anchors.length) {
      return {
        points: [],
        routeIndexByStep: new Map(),
        originRouteIndex: 0,
        destinationRouteIndex: 0,
      };
    }

    const points = [clonePoint(anchors[0].point)];
    const routeIndexByStep = new Map();
    routeIndexByStep.set(-1, 0);

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const current = anchors[index];
      const next = anchors[index + 1];
      const segmentDistance = Math.max(distanceBetween(current.point, next.point), 0.0001);
      const midpoint = interpolatePoint(current.point, next.point, 0.5);
      const deltaLat = next.point.lat - current.point.lat;
      const deltaLng = next.point.lng - current.point.lng;
      const segmentLength = Math.sqrt((deltaLat ** 2) + (deltaLng ** 2)) || 1;
      const perpendicular = { lat: -deltaLng / segmentLength, lng: deltaLat / segmentLength };
      const along = { lat: deltaLat / segmentLength, lng: deltaLng / segmentLength };
      const direction = this.rng() > 0.5 ? 1 : -1;
      const amplitude = Math.min(Math.max(segmentDistance * (0.18 + (this.rng() * 0.08)), 0.00085), 0.0085);
      const drift = (this.rng() - 0.5) * segmentDistance * 0.25;
      const controlPoint = {
        lat: midpoint.lat + (perpendicular.lat * amplitude * direction) + (along.lat * drift),
        lng: midpoint.lng + (perpendicular.lng * amplitude * direction) + (along.lng * drift),
      };
      const sampleCount = Math.max(8, Math.min(20, Math.round(segmentDistance / 0.008)));

      for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
        const t = sampleIndex / sampleCount;
        const point = quadraticBezier(current.point, controlPoint, next.point, t);
        const last = points[points.length - 1];
        if (!pointsEqual(last, point)) {
          points.push(point);
        }
      }

      if (next.kind === 'step') {
        routeIndexByStep.set(next.stepIndex, points.length - 1);
      }
      if (next.kind === 'destination') {
        routeIndexByStep.set('destination', points.length - 1);
      }
    }

    return {
      points,
      routeIndexByStep,
      originRouteIndex: 0,
      destinationRouteIndex: points.length - 1,
    };
  }

  getRouteIndexForStep(stepIndex = this.activeStepIndex) {
    return this.model.routeGeometryByStep.get(stepIndex) ?? this.model.originRouteIndex;
  }

  getRoutePoint(index) {
    const clamped = Math.max(0, Math.min(index, this.model.routeGeometry.length - 1));
    return clonePoint(this.model.routeGeometry[clamped]);
  }

  getRouteSlice(startIndex, endIndex) {
    const safeStart = Math.max(0, Math.min(startIndex, this.model.routeGeometry.length - 1));
    const safeEnd = Math.max(0, Math.min(endIndex, this.model.routeGeometry.length - 1));
    const step = safeStart <= safeEnd ? 1 : -1;
    const points = [];

    for (let index = safeStart; step > 0 ? index <= safeEnd : index >= safeEnd; index += step) {
      points.push(clonePoint(this.model.routeGeometry[index]));
    }

    return points;
  }

  getRetreatRouteIndex() {
    const retreatDistance = Math.max(2, Math.round(this.model.routeGeometry.length * 0.08));
    return Math.max(this.model.originRouteIndex, this.model.destinationRouteIndex - retreatDistance);
  }

  moveVehicleToStep(stepIndex) {
    const safeIndex = Math.max(0, Math.min(stepIndex, this.stepsChronological.length - 1));
    this.activeStepIndex = safeIndex;
    const step = this.stepsChronological[safeIndex] || null;
    const routeIndex = this.getRouteIndexForStep(safeIndex);

    return {
      step,
      routeIndex,
      truckPoint: this.getRoutePoint(routeIndex),
    };
  }

  updateCompletedPath(stepIndex = this.activeStepIndex, vehicleRouteIndex = null) {
    const routeIndex = vehicleRouteIndex ?? this.getRouteIndexForStep(stepIndex);
    return {
      full: this.model.routeGeometry.map((point) => [point.lat, point.lng]),
      completed: this.getRouteSlice(this.model.originRouteIndex, routeIndex).map((point) => [point.lat, point.lng]),
      remaining: this.getRouteSlice(routeIndex, this.model.destinationRouteIndex).map((point) => [point.lat, point.lng]),
    };
  }

  updateMarkerStates(stepIndex = this.activeStepIndex, vehicleRouteIndex = null) {
    const step = this.stepsChronological[stepIndex] || null;
    const delivered = step?.phase === 'delivered';
    const activeRouteIndex = vehicleRouteIndex ?? this.getRouteIndexForStep(stepIndex);
    const truckPoint = this.getRoutePoint(activeRouteIndex);
    const recipientPoint = clonePoint(this.destinationPoint);
    const display = this.preventMarkerOverlap(truckPoint, recipientPoint, { delivered });

    return {
      delivered,
      truckPoint,
      recipientPoint,
      retreatPoint: this.getRoutePoint(this.getRetreatRouteIndex()),
      routeIndex: activeRouteIndex,
      retreatRouteIndex: this.getRetreatRouteIndex(),
      ...display,
      truckEmoji: delivered ? '🚚' : '🚚📦',
      recipientEmoji: delivered ? '🤵‍♂️📦' : '🤵‍♂️',
    };
  }

  syncTimeline(stepIndex = this.activeStepIndex) {
    const steps = this.timelineSteps.map((step) => ({
      ...step,
      isClickable: true,
      isPast: step.stepIndex < stepIndex,
      isCurrent: step.stepIndex === stepIndex,
      isFuture: step.stepIndex > stepIndex,
      routeIndex: this.getRouteIndexForStep(step.stepIndex),
    }));

    return enrichStepStates(steps, this.timelineSteps.findIndex((step) => step.stepIndex === stepIndex));
  }

  preventMarkerOverlap(truckPoint, recipientPoint, options = {}) {
    const { delivered = false } = options;

    if (!truckPoint || !recipientPoint) {
      return {
        truckDisplayPoint: clonePoint(truckPoint),
        recipientDisplayPoint: clonePoint(recipientPoint),
        hasVisualSeparation: false,
      };
    }

    if (!this.isNearPoint(truckPoint, recipientPoint)) {
      return {
        truckDisplayPoint: clonePoint(truckPoint),
        recipientDisplayPoint: clonePoint(recipientPoint),
        hasVisualSeparation: false,
      };
    }

    const baseSpacing = delivered ? OVERLAP_OFFSET * 1.35 : OVERLAP_OFFSET;
    return {
      truckDisplayPoint: {
        lat: truckPoint.lat,
        lng: truckPoint.lng - baseSpacing,
      },
      recipientDisplayPoint: {
        lat: recipientPoint.lat,
        lng: recipientPoint.lng + baseSpacing,
      },
      hasVisualSeparation: true,
    };
  }

  isNearPoint(a, b, threshold = OVERLAP_THRESHOLD) {
    if (!a || !b) return false;
    return Math.abs(a.lat - b.lat) <= threshold && Math.abs(a.lng - b.lng) <= threshold;
  }
}

export function createTrackingRouteManager(result, options = {}) {
  return new TrackingRouteManager(result, options);
}
