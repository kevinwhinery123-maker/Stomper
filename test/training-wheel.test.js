const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrainingWheel } = require('../training-wheel');

const plan = {
  timezone: 'UTC', weekStart: '2026-07-20', weekEnd: '2026-07-26',
  today: { date: '2026-07-22', session: { status: 'today', restDay: false } },
  sessions: [
    { date: '2026-07-20', title: 'Easy run', type: 'Running', restDay: false, exercises: [['Run', '3 mi']] },
    { date: '2026-07-22', title: 'Strength', type: 'Strength', restDay: false, exercises: [['Squat', '3 × 8'], ['Row', '3 × 8']] },
    { date: '2026-07-25', title: 'Long run', type: 'Running', restDay: false, exercises: [['Run', '5 mi']] }
  ]
};

const workout = (date, overrides = {}) => ({
  type: 'running', outcome: 'completed', perceivedEffort: 5, durationMinutes: 30,
  source: 'manual', loggedAt: `${date}T12:00:00Z`, details: { running: { distance: 3, averagePace: '10:00' } }, ...overrides
});

test('builds weekly progress from the current plan and logged work', () => {
  const wheel = buildTrainingWheel({ plan, workouts: [workout('2026-07-20'), workout('2026-07-22', { type: 'lifting', details: { lifts: [{ exercise: 'Squat', sets: 3, reps: 8, weight: '100 lb' }] } })] });
  assert.equal(wheel.weekly.consistency, 67);
  assert.equal(wheel.weekly.runVolume, 38);
  assert.equal(wheel.weekly.liftVolume, 50);
  assert.equal(wheel.today.plan.score, 100);
  assert.equal(wheel.today.checkin.score, 0);
  assert.equal(wheel.axes.length, 8);
});

test('limits slow overall movement to three points up or four down', () => {
  const previousSnapshot = { overall: Object.fromEntries(['consistency','recovery','runVolume','paceProgress','longRunBase','liftVolume','strengthProgress','trainingBalance'].map(key => [key, 60])) };
  const wheel = buildTrainingWheel({ plan, workouts: [workout('2026-07-20'), workout('2026-07-22')], previousSnapshot });
  Object.values(wheel.overall).forEach(value => assert.ok(value >= 56 && value <= 63));
});

test('marks progression attributes unavailable until comparable data exists', () => {
  const wheel = buildTrainingWheel({ plan, workouts: [workout('2026-07-20')] });
  assert.equal(wheel.status, 'building-baseline');
  assert.equal(wheel.availability.paceProgress, false);
  assert.equal(wheel.availability.strengthProgress, false);
});

test('eases the overall profile back after multiple inactive weeks', () => {
  const overall = Object.fromEntries(['consistency','recovery','runVolume','paceProgress','longRunBase','liftVolume','strengthProgress','trainingBalance'].map(key => [key, 60]));
  const wheel = buildTrainingWheel({ plan, workouts: [], previousSnapshot: { weekStart: '2026-07-06', overall } });
  assert.ok(wheel.overall.consistency < 60);
  assert.ok(wheel.overall.consistency >= 52);
});

test('automatically closes the workout ring on a rest day', () => {
  const restPlan = { ...plan, today: { date: '2026-07-23', session: { status: 'rest', restDay: true } } };
  const wheel = buildTrainingWheel({ plan: restPlan, workouts: [] });
  assert.equal(wheel.today.plan.score, 100);
  assert.equal(wheel.today.plan.restDay, true);
  assert.match(wheel.today.label, /Plan ring is complete/);
});

test('closes Check-in and Reset rings from saved daily actions', () => {
  const wheel = buildTrainingWheel({ plan, workouts: [], tempoCheck: { energy: 'normal' }, dailyReset: { action: 'mobility' } });
  assert.equal(wheel.today.checkin.score, 100);
  assert.equal(wheel.today.reset.score, 100);
  assert.equal(wheel.today.reset.action, 'mobility');
  assert.ok(wheel.weekly.recovery > 0);
});
