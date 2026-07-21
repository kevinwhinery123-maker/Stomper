const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklyCoachSummary } = require('../weekly-summary');
const { validUsageEvent } = require('../usage-events');

function planWith(overrides = {}) {
  return {
    weekLabel: 'Jul 20 – Jul 26',
    sessions: [{ status: 'upcoming', restDay: false, title: 'Easy aerobic run', minutes: 30, intensity: 'Easy' }],
    fitnessSummary: {
      windows: { current7: { completedSessions: 2, partialSessions: 0, skippedSessions: 0, trainingMinutes: 75, runningMiles: 6, liftingSets: 9, highEffortSessions: 0 } },
      trends: { runningMiles: { direction: 'steady' } }, dataQuality: { level: 'growing' }
    }, ...overrides
  };
}

test('builds a useful weekly recap from structured training data', () => {
  const summary = buildWeeklyCoachSummary(planWith());
  assert.equal(summary.headline, 'You have something real to build on.');
  assert.match(summary.overview, /2 sessions/);
  assert.ok(summary.observations.some(item => /6 running miles/.test(item)));
  assert.ok(summary.observations.some(item => /9 lifting sets/.test(item)));
  assert.match(summary.nextFocus, /Easy aerobic run for 30 minutes/);
  assert.deepEqual(summary.metrics.map(metric => metric.value), [2, 75, 6, 9]);
});

test('keeps a no-data weekly recap conservative', () => {
  const summary = buildWeeklyCoachSummary(planWith({ fitnessSummary: { windows: { current7: {} }, dataQuality: { level: 'limited' } } }));
  assert.equal(summary.headline, 'Start with the next repeatable win.');
  assert.match(summary.overview, /No completed sessions/);
  assert.equal(summary.dataQuality, 'limited');
});

test('calls out high effort and incomplete sessions without diagnosing', () => {
  const input = planWith();
  input.fitnessSummary.windows.current7.partialSessions = 1;
  input.fitnessSummary.windows.current7.skippedSessions = 1;
  input.fitnessSummary.windows.current7.highEffortSessions = 1;
  const summary = buildWeeklyCoachSummary(input);
  assert.ok(summary.observations.some(item => /partial or skipped/.test(item)));
  assert.ok(summary.observations.some(item => /high-effort/.test(item)));
  assert.equal(JSON.stringify(summary).toLowerCase().includes('injury'), false);
});

test('usage tracking accepts only approved action names', () => {
  assert.equal(validUsageEvent('workout_logged'), 'workout_logged');
  assert.equal(validUsageEvent('coach_message_sent'), 'coach_message_sent');
  assert.equal(validUsageEvent('my private workout note'), null);
  assert.equal(validUsageEvent('password'), null);
  assert.equal(validUsageEvent({ event: 'plan_viewed' }), null);
});
