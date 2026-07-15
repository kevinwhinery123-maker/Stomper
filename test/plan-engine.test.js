const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../plan-engine');

const profile = { goal: 'both', trainingDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 45, trainingLevel: 'intermediate', equipment: 'full_gym' };

test('builds a balanced plan from a profile', () => {
  const plan = generatePlan(profile);
  assert.match(plan.title, /balance/);
  assert.ok(plan.sessions.some(item => item.type === 'Strength and running'));
  assert.ok(plan.sessions.some(item => item.intensity === 'Easy'));
});

test('adjusts the plan after a missed day instead of stacking hard work', () => {
  const plan = generatePlan(profile, true);
  assert.equal(plan.sessions[0].status, 'missed');
  assert.equal(plan.sessions[1].type, 'Recovery');
  assert.match(plan.adjustment, /not pushed onto tomorrow/);
});
