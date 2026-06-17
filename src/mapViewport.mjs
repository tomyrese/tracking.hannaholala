export function buildMarkerDisplayState(truckPoint, recipientPoint) {
  const options = arguments[2] || {};
  const { delivered = false } = options;

  if (!truckPoint || !recipientPoint) {
    return {
      truckDisplayPoint: delivered ? null : truckPoint || null,
      recipientDisplayPoint: recipientPoint || null,
      hasVisualSeparation: false,
    };
  }

  if (delivered) {
    return {
      truckDisplayPoint: null,
      recipientDisplayPoint: { ...recipientPoint },
      hasVisualSeparation: false,
    };
  }

  return {
    truckDisplayPoint: { ...truckPoint },
    recipientDisplayPoint: { ...recipientPoint },
    hasVisualSeparation: false,
  };
}

export function buildViewportFocusPoints({ truckDisplayPoint, recipientDisplayPoint }) {
  const points = [];
  if (truckDisplayPoint) points.push([truckDisplayPoint.lat, truckDisplayPoint.lng]);
  if (recipientDisplayPoint) points.push([recipientDisplayPoint.lat, recipientDisplayPoint.lng]);
  return points;
}
