const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFitnessSummary } = require('../fitness-summary');

const now = new Date('2026-07-21T16:00:00Z');
const workout = (date, overrides = {}) => ({
  title: 'Workout', type: 'running', outcome: 'completed', durationMinutes: 30,
  perceivedEffort: 5, details: { running: { distance: 3 } }, source: 'manual',
  loggedAt: `${date}T12:00:00Z`, ...overrides
});

test('summarizes recent and previous seven-day training windows', () => {
  const summary = buildFitnessSummary([
    workout('2026-07-21', { durationMinutes: 40, details: { running: { distance: 4 } } }),
    workout('2026-07-18', { durationMinutes: 30, details: { running: { distance: 3 } } }),
    workout('2026-07-12', { durationMinutes: 25, details: { running: { distance: 2 } } })
  ], { now, timezone: 'UTC' });
  assert.equal(summary.windows.current7.runningMiles, 7);
  assert.equal(summary.windows.previous7.runningMiles, 2);
  assert.equal(summary.windows.current7.trainingMinutes, 70);
  assert.equal(summary.trends.runningMiles.direction, 'higher');
  assert.match(summary.trends.runningMiles.description, /250% higher/);
});

test('counts partial work but keeps completion rate honest', () => {
  const summary = buildFitnessSummary([
    workout('2026-07-20'),
    workout('2026-07-19', { outcome: 'partial', durationMinutes: 15, details: { running: { distance: 1 } } }),
    workout('2026-07-18', { outcome: 'skipped', durationMinutes: 0, details: {} })
  ], { now, timezone: 'UTC' });
  assert.equal(summary.windows.current7.completedSessions, 1);
  assert.equal(summary.windows.current7.partialSessions, 1);
  assert.equal(summary.windows.current7.skippedSessions, 1);
  assert.equal(summary.windows.current7.trainingMinutes, 45);
  assert.equal(summary.consistency.completionRate, 33);
});

test('summarizes lifting details and data coverage without workout notes', () => {
  const summary = buildFitnessSummary([
    workout('2026-07-20', { type: 'lifting', source: 'strava', details: { lifts: [{ exercise: 'Back squat', sets: 3, reps: 8, weight: '135 lb' }] }, note: 'private free text' }),
    workout('2026-07-17', { type: 'strength', details: { lifts: [{ exercise: 'Back squat', sets: 4, reps: 6, weight: '140 lb' }] } })
  ], { now, timezone: 'UTC' });
  assert.equal(summary.windows.current7.liftingSets, 7);
  assert.equal(summary.highlights.strength[0].exercise, 'Back squat');
  assert.equal(summary.highlights.strength[0].latest.weight, '135 lb');
  assert.deepEqual(summary.dataQuality.sources.sort(), ['manual', 'strava']);
  assert.equal(JSON.stringify(summary).includes('private free text'), false);
});

test('flags thin data and high effort without diagnosing fatigue', () => {
  const summary = buildFitnessSummary([
    workout('2026-07-20', { perceivedEffort: 9 })
  ], { now, timezone: 'UTC' });
  assert.equal(summary.dataQuality.level, 'limited');
  assert.equal(summary.windows.current7.highEffortSessions, 1);
  assert.ok(summary.coachingSignals.some(signal => /high-effort/.test(signal)));
  assert.equal(JSON.stringify(summary).toLowerCase().includes('injur'), false);
});

test('ignores invalid and future-dated records', () => {
  const summary = buildFitnessSummary([
    workout('2026-07-22'),
    workout('not-a-date')
  ], { now, timezone: 'UTC' });
  assert.equal(summary.windows.recent28.completedSessions, 0);
  assert.equal(summary.dataQuality.level, 'limited');
});
