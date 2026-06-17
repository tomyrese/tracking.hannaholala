const DEFAULT_THRESHOLD = 0.0002;
const DEFAULT_OFFSET = 0.00016;

export function buildMarkerDisplayState(truckPoint, recipientPoint) {
  const options = arguments[2] || {};
  const { delivered = false, overlapThreshold = DEFAULT_THRESHOLD, overlapOffset = DEFAULT_OFFSET } = options;

  if (!truckPoint || !recipientPoint) {
    return {
      truckDisplayPoint: truckPoint || null,
      recipientDisplayPoint: recipientPoint || null,
      hasVisualSeparation: false,
    };
  }

  const nearEachOther =
    Math.abs(truckPoint.lat - recipientPoint.lat) <= overlapThreshold &&
    Math.abs(truckPoint.lng - recipientPoint.lng) <= overlapThreshold;

  if (!nearEachOther) {
    return {
      truckDisplayPoint: { ...truckPoint },
      recipientDisplayPoint: { ...recipientPoint },
      hasVisualSeparation: false,
    };
  }

  return {
    truckDisplayPoint: {
      lat: truckPoint.lat,
      lng: truckPoint.lng - overlapOffset,
    },
    recipientDisplayPoint: {
      lat: recipientPoint.lat,
      lng: recipientPoint.lng + overlapOffset,
    },
    hasVisualSeparation: delivered || true,
  };
}

export function buildViewportFocusPoints({ truckDisplayPoint, recipientDisplayPoint, originDisplayPoint }) {
  const points = [];
  if (originDisplayPoint) points.push([originDisplayPoint.lat, originDisplayPoint.lng]);
  if (truckDisplayPoint) points.push([truckDisplayPoint.lat, truckDisplayPoint.lng]);
  if (recipientDisplayPoint) points.push([recipientDisplayPoint.lat, recipientDisplayPoint.lng]);
  return points;
}
