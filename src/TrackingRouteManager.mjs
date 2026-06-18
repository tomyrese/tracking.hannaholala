const OVERLAP_THRESHOLD = 0.0002;
const OVERLAP_OFFSET = 0.00024;

function pickCoordinate(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isPointInVietnam(lat, lng) {
  return lat >= 8.18 && lat <= 23.39 && lng >= 102.14 && lng <= 109.46;
}

function readLocationPoint(location) {
  if (!location) return null;
  const lat = pickCoordinate(location.lat);
  const lng = pickCoordinate(location.long, pickCoordinate(location.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isPointInVietnam(lat, lng)) return null;
  return { lat, lng };
}

function readEventPoint(event) {
  if (!event) return null;
  const lat = pickCoordinate(event.lat);
  const lng = pickCoordinate(event.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isPointInVietnam(lat, lng)) return null;
  return { lat, lng };
}

function clonePoint(point) {
  return point ? { lat: point.lat, lng: point.lng } : null;
}

function hasFinitePoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

function pointsEqual(a, b) {
  return !!a && !!b && a.lat === b.lat && a.lng === b.lng;
}

function dedupePoints(points) {
  return points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}

function distanceSquared(a, b) {
  if (!a || !b) return Infinity;
  const deltaLat = b.lat - a.lat;
  const deltaLng = b.lng - a.lng;
  return (deltaLat ** 2) + (deltaLng ** 2);
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
  if (text.includes('khoi tao don hang') || text.includes('tao don hang') || text.includes('cho lay hang') || text.includes('ready to pick') || text.includes('ready_to_pick')) {
    return { phase: 'order_created', rank: 10, label: 'Cho lay hang', interactive: true };
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

function shiftPointAlongRoute(routeGeometry, currentIndex, distanceOffset, direction = 'backward') {
  if (!Array.isArray(routeGeometry) || routeGeometry.length === 0) return null;
  
  let index = Math.max(0, Math.min(currentIndex ?? 0, routeGeometry.length - 1));
  let accumulatedDistance = 0;
  
  while (true) {
    let nextIndex = direction === 'backward' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= routeGeometry.length) {
      const boundary = routeGeometry[index];
      return Array.isArray(boundary) 
        ? { lat: Number(boundary[0]), lng: Number(boundary[1]) }
        : { lat: Number(boundary.lat), lng: Number(boundary.lng) };
    }
    
    const rawP1 = routeGeometry[index];
    const rawP2 = routeGeometry[nextIndex];
    
    const p1 = Array.isArray(rawP1)
      ? { lat: Number(rawP1[0]), lng: Number(rawP1[1]) }
      : { lat: Number(rawP1?.lat), lng: Number(rawP1?.lng) };
      
    const p2 = Array.isArray(rawP2)
      ? { lat: Number(rawP2[0]), lng: Number(rawP2[1]) }
      : { lat: Number(rawP2?.lat), lng: Number(rawP2?.lng) };
    
    const dist = Math.hypot(p2.lat - p1.lat, p2.lng - p1.lng);
    
    accumulatedDistance += dist;
    index = nextIndex;
    
    if (accumulatedDistance >= distanceOffset) {
      const overshoot = accumulatedDistance - distanceOffset;
      const t = dist > 0 ? (overshoot / dist) : 0;
      return {
        lat: p2.lat + (p1.lat - p2.lat) * t,
        lng: p2.lng + (p1.lng - p2.lng) * t
      };
    }
  }
}

export class TrackingRouteManager {
  constructor(result, options = {}) {
    this.result = result || {};
    this.fallbackOrigin = options.fallbackOrigin || { lat: 21.0285, lng: 105.8542 };
    this.fallbackDestination = options.fallbackDestination || { lat: 10.8231, lng: 106.6297 };
    this.activeStepIndex = 0;
    this.model = this.generateRoutePoints();
  }

  generateRoutePoints() {
    const rawEvents = Array.isArray(this.result?.events) ? this.result.events : [];
    const eventPoints = rawEvents.map(readEventPoint).filter(Boolean);
    const firstEventPoint = eventPoints.at(-1) || null;
    const lastEventPoint = eventPoints[0] || null;

    const fallbackO = firstEventPoint || this.fallbackOrigin;
    const fallbackD = lastEventPoint || fallbackO || this.fallbackDestination;

    const originPoint =
      readLocationPoint(this.result?.from_location) ||
      readEventPoint(rawEvents.at(-1)) ||
      fallbackO;
    const deliveredEvent = rawEvents.find(e => {
      const text = String(e?.title || '').toLowerCase();
      return text.includes('giao thanh cong') || text.includes('giao hang thanh cong') || text.includes('delivered');
    });
    const expectedEvent = rawEvents.find(e => {
      const text = String(e?.title || '').toLowerCase();
      return text.includes('du kien giao');
    });
    const destinationPoint =
      readLocationPoint(this.result?.to_location) ||
      readEventPoint(deliveredEvent) ||
      readEventPoint(expectedEvent) ||
      fallbackD;

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

    const routeAnchors = this.generateAnchorPoints(stepsChronological);
    this.routeAnchors = routeAnchors;

    this.stepsChronological = stepsChronological.map((step) => ({
      ...step,
      anchorPoint: clonePoint(step.point),
      point: null,
      routeIndex: null,
      isRoutePoint: false,
    }));
    this.timelineSteps = [...this.stepsChronological].sort((a, b) => b.stepIndex - a.stepIndex);
    let activeIdx = this.stepsChronological.length - 1;
    for (let i = this.stepsChronological.length - 1; i >= 0; i--) {
      const step = this.stepsChronological[i];
      if (step.time && step.phase !== 'expected_delivery') {
        activeIdx = i;
        break;
      }
    }
    this.activeStepIndex = activeIdx;

    const latestStep = this.stepsChronological.at(-1) || null;
    const delivered = latestStep?.phase === 'delivered';
    const currentPoint = delivered ? destinationPoint : originPoint;
    const initialRouteGeometry = dedupePoints(routeAnchors.map((anchor) => clonePoint(anchor.point)).filter(hasFinitePoint));

    return {
      origin: clonePoint(originPoint),
      destination: clonePoint(destinationPoint),
      current: clonePoint(currentPoint),
      currentTitle: latestStep?.title || 'Vi tri xe hien tai',
      currentCheckpoint: latestStep,
      routePoints: routeAnchors,
      routeGeometry: initialRouteGeometry,
      routeGeometryByStep: new Map(),
      originRouteIndex: 0,
      destinationRouteIndex: Math.max(0, initialRouteGeometry.length - 1),
      checkpoints: this.timelineSteps,
      stepsChronological: this.stepsChronological,
      isDelivered: delivered,
      isCollapsed: pointsEqual(currentPoint, destinationPoint),
      isNearDestination: this.isNearPoint(currentPoint, destinationPoint),
    };
  }

  setRouteGeometry(routePoints) {
    if (!Array.isArray(routePoints) || routePoints.length < 2) return;

    const normalizedPoints = routePoints.map((point) =>
      Array.isArray(point)
        ? { lat: Number(point[0]), lng: Number(point[1]) }
        : { lat: Number(point.lat), lng: Number(point.lng) }
    ).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    if (normalizedPoints.length < 2) return;

    console.log('Route Geometry Length:', normalizedPoints.length);
    if (normalizedPoints.length < 10) {
      console.warn('Route geometry looks too short; expected dense OSRM geometry but received fewer than 10 points.');
    }

    const routeIndexByStep = this.buildTimelinePoints(normalizedPoints, this.stepsChronological.length);

    this.model = {
      ...this.model,
      routeGeometry: normalizedPoints,
      routeGeometryByStep: routeIndexByStep,
      originRouteIndex: 0,
      destinationRouteIndex: normalizedPoints.length - 1,
      current: this.getRoutePoint(routeIndexByStep.get(this.activeStepIndex) ?? normalizedPoints.length - 1),
    };

    this.stepsChronological = this.stepsChronological.map((step) => {
      const routeIndex = routeIndexByStep.get(step.stepIndex) ?? 0;
      return {
        ...step,
        routeIndex,
        point: clonePoint(normalizedPoints[routeIndex]),
        isRoutePoint: true,
      };
    });
    this.timelineSteps = [...this.stepsChronological].sort((a, b) => b.stepIndex - a.stepIndex);
    this.model.currentCheckpoint = this.stepsChronological[this.activeStepIndex] || null;
    this.model.checkpoints = this.timelineSteps;
    this.model.stepsChronological = this.stepsChronological;
  }

  generateAnchorPoints(steps) {
    const anchors = [
      { kind: 'origin', point: clonePoint(this.originPoint), stepIndex: -1 },
      ...steps.map((step) => ({
        kind: 'step',
        point: step.point ? clonePoint(step.point) : null,
        stepIndex: step.stepIndex,
        phase: step.phase,
      })),
      { kind: 'destination', point: clonePoint(this.destinationPoint), stepIndex: steps.length },
    ];

    return anchors.filter((anchor, index, list) => {
      if (!anchor.point && anchor.kind === 'step') return false;
      return index === 0 || !pointsEqual(anchor.point, list[index - 1].point);
    });
  }

  buildTimelinePoints(routeCoords, totalSteps) {
    const result = new Map();
    if (!Array.isArray(routeCoords) || routeCoords.length < 2 || totalSteps <= 0) {
      return result;
    }

    const locateNearestRouteIndex = (point, startIndex = 0, endIndex = routeCoords.length - 1) => {
      if (!hasFinitePoint(point)) return null;

      let bestIndex = Math.max(0, Math.min(startIndex, routeCoords.length - 1));
      let bestDistance = Infinity;

      for (let index = bestIndex; index <= Math.max(bestIndex, Math.min(endIndex, routeCoords.length - 1)); index += 1) {
        const candidate = routeCoords[index];
        const distance = distanceSquared(candidate, point);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      return bestIndex;
    };

    const knownAssignments = [
      { stepIndex: -1, routeIndex: 0 },
      { stepIndex: totalSteps, routeIndex: routeCoords.length - 1 },
    ];

    const stepAnchorByStepIndex = new Map(
      this.stepsChronological
        .filter((step) => hasFinitePoint(step.anchorPoint))
        .map((step) => [step.stepIndex, clonePoint(step.anchorPoint)]),
    );

    let minimumRouteIndex = 0;
    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
      const anchorPoint = stepAnchorByStepIndex.get(stepIndex);
      if (!anchorPoint) continue;

      const routeIndex = locateNearestRouteIndex(anchorPoint, minimumRouteIndex);
      if (routeIndex === null) continue;

      knownAssignments.push({ stepIndex, routeIndex });
      minimumRouteIndex = routeIndex;
    }

    knownAssignments.sort((a, b) => a.stepIndex - b.stepIndex);

    const explicitAssignments = new Map(
      knownAssignments
        .filter((assignment) => assignment.stepIndex >= 0 && assignment.stepIndex < totalSteps)
        .map((assignment) => [assignment.stepIndex, assignment.routeIndex]),
    );

    if (!explicitAssignments.size) {
      if (totalSteps === 1) {
        result.set(0, routeCoords.length - 1);
        return result;
      }

      for (let index = 0; index < totalSteps; index += 1) {
        const ratio = index / (totalSteps - 1);
        const routeIndex = Math.round(ratio * (routeCoords.length - 1));
        result.set(index, routeIndex);
      }

      return result;
    }

    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
      if (explicitAssignments.has(stepIndex)) {
        result.set(stepIndex, explicitAssignments.get(stepIndex));
        continue;
      }

      const nextBoundaryIndex = knownAssignments.findIndex((assignment) => assignment.stepIndex > stepIndex);
      const previousAssignment = knownAssignments[Math.max(0, nextBoundaryIndex - 1)] || knownAssignments[0];
      const nextAssignment = knownAssignments[Math.max(0, nextBoundaryIndex)] || knownAssignments.at(-1);

      if (!nextAssignment || previousAssignment.stepIndex === nextAssignment.stepIndex) {
        result.set(stepIndex, previousAssignment?.routeIndex ?? 0);
        continue;
      }

      const ratio = (stepIndex - previousAssignment.stepIndex) / (nextAssignment.stepIndex - previousAssignment.stepIndex);
      const routeIndex = Math.round(
        previousAssignment.routeIndex + ((nextAssignment.routeIndex - previousAssignment.routeIndex) * ratio),
      );
      result.set(stepIndex, routeIndex);
    }

    return result;
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
    return this.model.destinationRouteIndex;
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
    const display = this.preventMarkerOverlap(truckPoint, recipientPoint, { delivered, routeIndex: activeRouteIndex });

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
    const { delivered = false, routeIndex = null } = options;

    if (!truckPoint || !recipientPoint) {
      return {
        truckDisplayPoint: clonePoint(truckPoint),
        recipientDisplayPoint: clonePoint(recipientPoint),
        hasVisualSeparation: false,
      };
    }

    const recipientDisplayPoint = clonePoint(recipientPoint);

    if (!this.isNearPoint(truckPoint, recipientPoint)) {
      return {
        truckDisplayPoint: clonePoint(truckPoint),
        recipientDisplayPoint,
        hasVisualSeparation: false,
      };
    }

    const baseSpacing = delivered ? OVERLAP_OFFSET * 1.35 : OVERLAP_OFFSET;
    const routeGeometry = this.model?.routeGeometry || [truckPoint, recipientPoint];
    const currentIndex = routeIndex !== null ? routeIndex : (routeGeometry.length - 1);
    const truckDisplayPoint = shiftPointAlongRoute(routeGeometry, currentIndex, baseSpacing, 'backward') || {
      lat: truckPoint.lat,
      lng: truckPoint.lng - baseSpacing,
    };

    return {
      truckDisplayPoint,
      recipientDisplayPoint,
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
