const DEFAULT_THRESHOLD = 0.0002;
const DEFAULT_OFFSET = 0.00015;

export function shiftPointAlongRoute(routeGeometry, currentIndex, distanceOffset, direction = 'backward') {
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

export function buildMarkerDisplayState(truckPoint, recipientPoint) {
  const options = arguments[2] || {};
  const {
    delivered = false,
    overlapThreshold = DEFAULT_THRESHOLD,
    overlapOffset = DEFAULT_OFFSET,
    originPoint = null,
    routeGeometry = null,
    vehicleRouteIndex = null,
    isPickingPhase = false,
    isDeliveryPhase = false,
  } = options;

  let truckDisplay = truckPoint ? { ...truckPoint } : null;
  let recipientDisplay = recipientPoint ? { ...recipientPoint } : null;
  let originDisplay = originPoint ? { ...originPoint } : null;
  let hasVisualSeparation = false;

  // 1. Check truck-recipient overlap
  if (truckDisplay && recipientDisplay) {
    const nearEachOther =
      Math.abs(truckDisplay.lat - recipientDisplay.lat) <= overlapThreshold &&
      Math.abs(truckDisplay.lng - recipientDisplay.lng) <= overlapThreshold;

    if (nearEachOther) {
      const effectiveOffset = delivered ? overlapOffset * 1.5 : overlapOffset;
      if (Array.isArray(routeGeometry) && vehicleRouteIndex !== null) {
        const shifted = shiftPointAlongRoute(routeGeometry, vehicleRouteIndex, effectiveOffset, 'backward');
        if (shifted) {
          truckDisplay = shifted;
        } else {
          truckDisplay.lng = truckPoint.lng - effectiveOffset;
        }
      } else {
        truckDisplay.lng = truckPoint.lng - effectiveOffset;
      }
      hasVisualSeparation = true;
    }
  }

  // 2. Check origin-truck overlap
  if (originDisplay && truckDisplay) {
    const nearOrigin =
      Math.abs(truckDisplay.lat - originDisplay.lat) <= overlapThreshold &&
      Math.abs(truckDisplay.lng - originDisplay.lng) <= overlapThreshold;

    if (nearOrigin) {
      const effectiveOffset = overlapOffset;
      if (Array.isArray(routeGeometry) && vehicleRouteIndex !== null) {
        const shifted = shiftPointAlongRoute(routeGeometry, vehicleRouteIndex, effectiveOffset, 'forward');
        if (shifted) {
          truckDisplay = shifted;
        } else {
          truckDisplay.lng = truckPoint.lng + effectiveOffset;
        }
      } else {
        truckDisplay.lng = truckPoint.lng + effectiveOffset;
      }
      hasVisualSeparation = true;
    }
  }

  const result = {
    truckDisplayPoint: truckDisplay,
    recipientDisplayPoint: recipientDisplay,
    hasVisualSeparation,
  };

  if (originPoint) {
    result.originDisplayPoint = originDisplay;
  }

  return result;
}

export function buildViewportFocusPoints({ truckDisplayPoint, recipientDisplayPoint, originDisplayPoint }) {
  const points = [];
  if (originDisplayPoint) points.push([originDisplayPoint.lat, originDisplayPoint.lng]);
  if (truckDisplayPoint) points.push([truckDisplayPoint.lat, truckDisplayPoint.lng]);
  if (recipientDisplayPoint) points.push([recipientDisplayPoint.lat, recipientDisplayPoint.lng]);
  return points;
}

