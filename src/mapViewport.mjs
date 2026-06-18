const DEFAULT_THRESHOLD = 0.0002;
const DEFAULT_OFFSET = 0.00016;

export function buildMarkerDisplayState(truckPoint, recipientPoint) {
  const options = arguments[2] || {};
  const {
    delivered = false,
    overlapThreshold = DEFAULT_THRESHOLD,
    overlapOffset = DEFAULT_OFFSET,
    originPoint = null,
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
      truckDisplay.lng = truckPoint.lng - overlapOffset;
      recipientDisplay.lng = recipientPoint.lng + overlapOffset;
      hasVisualSeparation = true;
    }
  }

  // 2. Check origin-truck overlap
  if (originDisplay && truckDisplay) {
    const nearOrigin =
      Math.abs(truckDisplay.lat - originDisplay.lat) <= overlapThreshold &&
      Math.abs(truckDisplay.lng - originDisplay.lng) <= overlapThreshold;

    if (nearOrigin) {
      originDisplay.lng = originPoint.lng - overlapOffset;
      truckDisplay.lng = truckPoint.lng + overlapOffset;
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

