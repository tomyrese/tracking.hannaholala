const VISUAL_OVERLAP_THRESHOLD = 0.0012;
const VISUAL_OFFSET = {
  lat: 0.00042,
  lng: 0.00058,
};

function pointsAreNear(a, b, threshold = VISUAL_OVERLAP_THRESHOLD) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= threshold && Math.abs(a.lng - b.lng) <= threshold;
}

export function buildMarkerDisplayState(truckPoint, recipientPoint) {
  if (!truckPoint || !recipientPoint) {
    return {
      truckDisplayPoint: truckPoint || null,
      recipientDisplayPoint: recipientPoint || null,
      hasVisualSeparation: false,
    };
  }

  if (!pointsAreNear(truckPoint, recipientPoint)) {
    return {
      truckDisplayPoint: { ...truckPoint },
      recipientDisplayPoint: { ...recipientPoint },
      hasVisualSeparation: false,
    };
  }

  return {
    truckDisplayPoint: {
      lat: truckPoint.lat - VISUAL_OFFSET.lat,
      lng: truckPoint.lng - VISUAL_OFFSET.lng,
    },
    recipientDisplayPoint: {
      lat: recipientPoint.lat + VISUAL_OFFSET.lat,
      lng: recipientPoint.lng + VISUAL_OFFSET.lng,
    },
    hasVisualSeparation: true,
  };
}

export function buildViewportFocusPoints({ truckDisplayPoint, recipientDisplayPoint }) {
  const points = [];
  if (truckDisplayPoint) points.push([truckDisplayPoint.lat, truckDisplayPoint.lng]);
  if (recipientDisplayPoint) points.push([recipientDisplayPoint.lat, recipientDisplayPoint.lng]);
  return points;
}
