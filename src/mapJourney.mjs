import { createTrackingRouteManager } from './TrackingRouteManager.mjs';

export function buildMapJourney(result, fallbackOrigin, fallbackDestination) {
  const manager = createTrackingRouteManager(result, {
    fallbackOrigin,
    fallbackDestination,
  });

  const model = manager.model;
  const stepsChronological = model.stepsChronological || [];
  const currentCheckpoint = stepsChronological.at(-1) || null;
  const routePaths = manager.updateCompletedPath(stepsChronological.length ? stepsChronological.length - 1 : 0);

  const checkpoints = [...stepsChronological].reverse().map((step, index) => ({
    ...step,
    lat: step.point?.lat,
    lng: step.point?.lng,
    timelineIndex: index,
  }));

  const currentTimelineIndex = checkpoints.findIndex((step) => step.stepIndex === currentCheckpoint?.stepIndex);
  const checkpointByStepIndex = new Map(checkpoints.map((checkpoint) => [checkpoint.stepIndex, checkpoint]));

  const pathPoints = model.routePoints.map((point) => {
    if (point.kind === 'origin') {
      return {
        lat: point.point.lat,
        lng: point.point.lng,
        kind: 'origin',
        timelineIndex: null,
        title: 'Diem gui hang',
      };
    }

    if (point.kind === 'destination') {
      return {
        lat: point.point.lat,
        lng: point.point.lng,
        kind: 'destination',
        timelineIndex: null,
        title: 'Diem nhan hang',
      };
    }

    const checkpoint = checkpointByStepIndex.get(point.stepIndex);
    return {
      lat: point.point.lat,
      lng: point.point.lng,
      kind: 'event',
      timelineIndex: checkpoint?.timelineIndex ?? null,
      title: checkpoint?.title || 'Cap nhat hanh trinh',
    };
  });

  const segments = [];
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const from = pathPoints[index];
    const to = pathPoints[index + 1];
    let status = 'upcoming';

    if (index < currentTimelineIndex + 1) status = 'completed';
    else if (index === currentTimelineIndex + 1) status = 'active';

    segments.push({
      index,
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
      fromTimelineIndex: from.timelineIndex,
      toTimelineIndex: to.timelineIndex,
      status,
    });
  }

  return {
    origin: model.origin,
    current: model.current,
    currentTitle: model.currentTitle,
    destination: model.destination,
    routeStart: model.current,
    routeEnd: model.destination,
    isCollapsed: model.isCollapsed,
    isNearDestination: model.isNearDestination,
    currentCheckpoint: currentCheckpoint
      ? {
          ...currentCheckpoint,
          timelineIndex: currentTimelineIndex,
          lat: currentCheckpoint.point?.lat,
          lng: currentCheckpoint.point?.lng,
        }
      : null,
    checkpoints,
    pathPoints,
    segments,
    routePaths,
  };
}
