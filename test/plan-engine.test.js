const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../plan-engine');

const profile = { goal: 'both', trainingDays: ['Mon', 'Wed', 'Fri', 'Sun'], sessionMinutes: 45, trainingLevel: 'intermediate', equipment: 'full_gym', timezone: 'America/New_York' };
const wednesday = new Date('2026-07-15T16:00:00Z');

test('builds a date-aware weekly plan from chosen training days', () => {
  const plan = generatePlan(profile, { now: wednesday });
  assert.equal(plan.today.date, '2026-07-15');
  assert.deepEqual(plan.sessions.map(session => session.day), ['Mon', 'Wed', 'Fri', 'Sun']);
  assert.equal(plan.sessions[1].status, 'today');
});
test('carries a missed session into the next two scheduled sessions safely', () => {
  const plan = generatePlan(profile, { now: wednesday, missedToday: { at: '2026-07-13T16:00:00Z' } });
  assert.match(plan.adjustment, /easier re-entry/);
});
test('does not carry a previous-week adjustment into a new week', () => {
  const nextWeek = new Date('2026-07-20T16:00:00Z');
  const plan = generatePlan(profile, { now: nextWeek, missedToday: { at: '2026-07-14T16:00:00Z' } });
  assert.equal(plan.adjustment, null);
});
test('changes the next demanding session to recovery after a very hard workout', () => {
  const plan = generatePlan(profile, { now: wednesday, workouts: [{ outcome: 'completed', perceivedEffort: 9, loggedAt: '2026-07-14T20:00:00Z' }] });
  assert.equal(plan.feedbackAdjustment.type, 'recovery');
  assert.equal(plan.today.session.intensity, 'Easy');
});
test('adds only a small progression after consistently comfortable workouts', () => {
  const workouts = [1, 2, 3].map(day => ({ outcome: 'completed', perceivedEffort: 5, loggedAt: `2026-07-${10 + day}T20:00:00Z` }));
  const plan = generatePlan(profile, { now: wednesday, workouts });
  assert.equal(plan.feedbackAdjustment.type, 'progression');
  assert.ok(plan.sessions.some(session => session.exercises.some(exercise => exercise[0] === 'Gentle progression')));
});
test('uses a saved recommended workout swap for the matching future day', () => {
  const plan = generatePlan(profile, { now: wednesday, overrides: [{ date: '2026-07-17', alternativeId: 'mobility', title: 'Mobility + core reset', type: 'Recovery', intensity: 'Easy', exercises: [['Mobility flow', '15 min']] }] });
  const friday = plan.sessions.find(session => session.date === '2026-07-17');
  assert.equal(friday.title, 'Mobility + core reset');
  assert.equal(friday.customized, true);
  assert.equal(friday.selectedAlternative, 'mobility');
});
