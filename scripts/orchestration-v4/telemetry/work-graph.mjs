export function summarizeGraphTelemetry({ nodes = [], events = [], now = new Date() } = {}) {
  const completed = nodes.filter((node) => ['ACCEPTED', 'COMPLETE'].includes(node.state));
  const replans = nodes.filter((node) => node.state === 'REPLAN_REQUIRED');
  const corrections = events.filter((event) => event.type === 'CORRECTION_ATTEMPT');
  const falseWaits = events.filter((event) => event.type === 'FALSE_DEPENDENCY_REMOVED');
  const humanWaits = events.filter((event) => event.type === 'HUMAN_WAIT_ENDED');
  const humanBlockedMs = humanWaits.reduce((total, event) => total + Math.max(0, Number(event.durationMs) || 0), 0);
  const firstPass = completed.filter((node) => Number(node.attempt ?? 1) === 1).length;
  return Object.freeze({
    generatedAt: new Date(now).toISOString(),
    nodeCount: nodes.length,
    completedCount: completed.length,
    firstPassAcceptanceRate: completed.length ? firstPass / completed.length : null,
    correctionAttempts: corrections.length,
    replanCount: replans.length,
    falseDependenciesRemoved: falseWaits.length,
    humanBlockedMs,
  });
}

export function snapshotGraphTelemetry(db, { now = new Date() } = {}) {
  const nodes = db.prepare('SELECT state,attempt FROM tasks ORDER BY created_at,rowid').all();
  const events = db.prepare('SELECT type,payload_json FROM orchestration_events ORDER BY event_id').all().map((event) => ({
    type: event.type,
    ...JSON.parse(event.payload_json || '{}'),
  }));
  return summarizeGraphTelemetry({ nodes, events, now });
}
