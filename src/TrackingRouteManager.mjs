const OVERLAP_THRESHOLD = 0.0002;
const OVERLAP_OFFSET = 0.00016;

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

function interpolatePoint(from, to, ratio) {
  if (!from && !to) return null;
  if (!from) return clonePoint(to);
  if (!to) return clonePoint(from);

  return {
    lat: from.lat + ((to.lat - from.lat) * ratio),
    lng: from.lng + ((to.lng - from.lng) * ratio),
  };
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

function classifyTrackingEvent(event, index) {
  const title = String(event?.title || '');
  const text = normalizeText(title);

  if (!text) {
    return {
      phase: `misc-${index}`,
      rank: 50 + index,
      label: 'Cap nhat hanh trinh',
      interactive: false,
    };
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
    this.activeStepIndex = 0;
    this.model = this.generateRoutePoints();
  }

  generateRoutePoints() {
    const rawEvents = Array.isArray(this.result?.events) ? this.result.events : [];
    const recipientPoint = readLocationPoint(this.result?.to_location);
    const originPoint =
      readLocationPoint(this.result?.from_location) ||
      readEventPoint(rawEvents.at(-1)) ||
      this.fallbackOrigin;
    const destinationPoint =
      recipientPoint ||
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
        lat: event?.lat,
        lng: event?.lng,
        point: readEventPoint(event),
        hasRealPoint: Boolean(readEventPoint(event)),
      });
    });

    const stepsChronological = Array.from(selectedByPhase.values())
      .sort((a, b) => a.rank - b.rank)
      .map((step, orderIndex) => ({
        ...step,
        stepIndex: orderIndex,
      }));

    this.originPoint = clonePoint(originPoint);
    this.destinationPoint = clonePoint(destinationPoint);

    const virtualizedSteps = this.generateVirtualPoints(stepsChronological);
    const pathSteps = virtualizedSteps.map((step) => ({
      ...step,
      timelineIndex: virtualizedSteps.length - 1 - step.stepIndex,
    }));

    const allRoutePoints = [
      { lat: originPoint.lat, lng: originPoint.lng, kind: 'origin', stepIndex: -1, timelineIndex: virtualizedSteps.length },
      ...pathSteps.map((step) => ({ lat: step.point.lat, lng: step.point.lng, kind: 'step', stepIndex: step.stepIndex, timelineIndex: step.timelineIndex })),
      { lat: destinationPoint.lat, lng: destinationPoint.lng, kind: 'destination', stepIndex: pathSteps.length, timelineIndex: -1 },
    ].filter((point, index, list) => index === 0 || !pointsEqual(point, list[index - 1]));

    const latestStep = pathSteps.at(-1) || null;
    const delivered = latestStep?.phase === 'delivered';
    const currentPoint = latestStep?.point || originPoint;
    const currentTitle = latestStep?.title || 'Vi tri xe hien tai';

    this.stepsChronological = pathSteps;
    this.timelineSteps = [...pathSteps].sort((a, b) => b.stepIndex - a.stepIndex);
    this.activeStepIndex = pathSteps.length ? pathSteps.length - 1 : 0;

    return {
      origin: clonePoint(originPoint),
      destination: clonePoint(destinationPoint),
      current: clonePoint(currentPoint),
      currentTitle,
      currentCheckpoint: latestStep,
      routePoints: allRoutePoints,
      checkpoints: this.timelineSteps,
      stepsChronological: pathSteps,
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

  moveVehicleToStep(stepIndex) {
    const safeIndex = Math.max(0, Math.min(stepIndex, this.stepsChronological.length - 1));
    this.activeStepIndex = safeIndex;
    const step = this.stepsChronological[safeIndex] || null;

    return {
      step,
      truckPoint: step?.point ? clonePoint(step.point) : clonePoint(this.originPoint),
    };
  }

  updateCompletedPath(stepIndex = this.activeStepIndex) {
    const activeStep = this.stepsChronological[stepIndex] || null;
    const completed = [clonePoint(this.originPoint)];
    const remaining = [];

    for (const step of this.stepsChronological) {
      if (step.stepIndex <= stepIndex) {
        completed.push(clonePoint(step.point));
      } else {
        remaining.push(clonePoint(step.point));
      }
    }

    completed.push(activeStep?.phase === 'delivered' ? clonePoint(this.destinationPoint) : clonePoint(activeStep?.point || this.originPoint));

    const nextPath = [
      clonePoint(activeStep?.point || this.originPoint),
      ...remaining,
      clonePoint(this.destinationPoint),
    ].filter(Boolean);

    return {
      full: this.model.routePoints.map((point) => [point.lat, point.lng]),
      completed: completed.filter(Boolean).map((point, index, list) => {
        if (index > 0 && pointsEqual(point, list[index - 1])) return null;
        return [point.lat, point.lng];
      }).filter(Boolean),
      remaining: nextPath.map((point, index, list) => {
        if (index > 0 && pointsEqual(point, list[index - 1])) return null;
        return [point.lat, point.lng];
      }).filter(Boolean),
    };
  }

  updateMarkerStates(stepIndex = this.activeStepIndex) {
    const step = this.stepsChronological[stepIndex] || null;
    const delivered = step?.phase === 'delivered';
    const truckPoint = delivered
      ? clonePoint(this.destinationPoint)
      : clonePoint(step?.point || this.originPoint);
    const recipientPoint = clonePoint(this.destinationPoint);
    const display = this.preventMarkerOverlap(truckPoint, recipientPoint, { delivered });

    if (!delivered && this.isNearPoint(truckPoint, this.originPoint)) {
      display.truckDisplayPoint = {
        lat: display.truckDisplayPoint.lat + (OVERLAP_OFFSET * 0.45),
        lng: display.truckDisplayPoint.lng + OVERLAP_OFFSET,
      };
      display.hasVisualSeparation = true;
    }

    return {
      delivered,
      truckPoint,
      recipientPoint,
      ...display,
      truckEmoji: delivered ? '🚚' : '🚚📦',
      recipientEmoji: delivered ? '🤵‍♂️📦' : '🤵‍♂️',
      originEmoji: '🚚📦',
    };
  }

  syncTimeline(stepIndex = this.activeStepIndex) {
    const steps = this.timelineSteps.map((step) => {
      const timelineOrderIndex = this.timelineSteps.findIndex((candidate) => candidate.stepIndex === step.stepIndex);
      const chronologicalDistance = this.stepsChronological.length - 1 - timelineOrderIndex;
      return {
        ...step,
        isClickable: true,
        isPast: step.stepIndex < stepIndex,
        isCurrent: step.stepIndex === stepIndex,
        isFuture: step.stepIndex > stepIndex,
        chronologicalDistance,
      };
    });

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

    const truckDirection = delivered ? -1 : -1;
    const recipientDirection = delivered ? 1 : 1;

    return {
      truckDisplayPoint: {
        lat: truckPoint.lat,
        lng: truckPoint.lng + (OVERLAP_OFFSET * truckDirection),
      },
      recipientDisplayPoint: {
        lat: recipientPoint.lat,
        lng: recipientPoint.lng + (OVERLAP_OFFSET * recipientDirection),
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
