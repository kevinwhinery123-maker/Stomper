const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../plan-engine');
const { interpretCoachAction } = require('../coach');

const profile = {
  goal: 'both', trainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], sessionMinutes: 45,
  trainingLevel: 'intermediate', equipment: 'full_gym', trainingLocation: 'both', timezone: 'America/New_York'
};
const plan = generatePlan(profile, { workouts: [] });

test('fallback coach understands clear profile and workout updates', () => {
  assert.deepEqual(interpretCoachAction('I can train Monday, Wednesday, and Friday.', plan, profile), { type: 'training_days', trainingDays: ['Mon', 'Wed', 'Fri'] });
  assert.equal(interpretCoachAction('Change my goal to strength.', plan, profile).goal, 'build_strength');
  assert.equal(interpretCoachAction('Make my sessions 30 minutes.', plan, profile).sessionMinutes, 30);
  const lift = interpretCoachAction('Log bench press 3x8 at 135 lb.', plan, profile);
  assert.deepEqual(lift, { type: 'log_lift', exercise: 'bench press', sets: 3, reps: 8, weight: '135 lb' });
  assert.equal(interpretCoachAction('Log a 3 mile run for 28 minutes effort 6.', plan, profile).type, 'log_run');
  assert.deepEqual(interpretCoachAction('I walked 25 minutes.', plan, profile), { type: 'log_walk', minutes: 25 });
  assert.equal(interpretCoachAction('I have a home gym now.', plan, profile).equipment, 'home_gym');
  assert.equal(interpretCoachAction('Set my running location to outdoor.', plan, profile).trainingLocation, 'outdoor');
  const todaySetup = interpretCoachAction('Make today an indoor run for 20 minutes.', plan, profile);
  assert.deepEqual(todaySetup, { type: 'tempo_check', availableMinutes: 20, energy: 'normal', trainingMode: 'running', setup: 'indoor' });
});
