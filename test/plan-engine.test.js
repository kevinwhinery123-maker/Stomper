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
