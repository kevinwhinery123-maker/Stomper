const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../plan-engine');

const profile = { goal: 'both', trainingDays: ['Mon', 'Wed', 'Fri', 'Sun'], sessionMinutes: 45, trainingLevel: 'intermediate', equipment: 'full_gym', timezone: 'America/New_York' };
const wednesday = new Date('2026-07-15T16:00:00Z');

test('builds a date-aware weekly plan from chosen training days', () => {
  const plan = generatePlan(profile, { now: wednesday });
  assert.equal(plan.today.date, '2026-07-15');
  assert.deepEqual(plan.sessions.map(session => session.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(plan.sessions[2].status, 'today');
  assert.equal(plan.sessions[1].title, 'Rest day');
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
  assert.ok(plan.sessions.some(session => session.exercises.some(exercise => exercise[0] === 'Optional progression')));
});
test('uses a saved recommended workout swap for the matching future day', () => {
  const plan = generatePlan(profile, { now: wednesday, overrides: [{ date: '2026-07-17', alternativeId: 'mobility', title: 'Mobility + core reset', type: 'Recovery', intensity: 'Easy', exercises: [['Mobility flow', '15 min']] }] });
  const friday = plan.sessions.find(session => session.date === '2026-07-17');
  assert.equal(friday.title, 'Mobility + core reset');
  assert.equal(friday.customized, true);
  assert.equal(friday.selectedAlternative, 'mobility');
  assert.deepEqual(friday.alternatives.map(option => option.id), ['full-body', 'upper-body', 'easy-run', 'mobility']);
});
test('keeps a user workout choice when a missed day creates a recovery reset', () => {
  const plan = generatePlan(profile, { now: wednesday, missedToday: { at: '2026-07-13T16:00:00Z' }, overrides: [{ date: '2026-07-17', alternativeId: 'easy-run', title: 'Easy aerobic run', type: 'Running', intensity: 'Easy', exercises: [['Easy run or walk-run', '30 min'], ['Mobility reset', '8 min']] }] });
  const friday = plan.sessions.find(session => session.date === '2026-07-17');
  assert.equal(friday.title, 'Easy aerobic run');
  assert.deepEqual(friday.exercises, [['Easy run or walk-run', '30 min'], ['Mobility reset', '8 min']]);
});
test('uses the chosen running location in newly generated run sessions', () => {
  const plan = generatePlan({ ...profile, goal: 'run_stronger', trainingLocation: 'indoor' }, { now: wednesday });
  assert.ok(plan.sessions.some(session => session.exercises.some(exercise => /Treadmill/.test(exercise[0]))));
});
test('creates a 12-minute minimum workout from a daily Tempo Check', () => {
  const plan = generatePlan(profile, { now: wednesday, tempoCheck: { availableMinutes: 12, energy: 'low' } });
  assert.equal(plan.today.session.minutes, 12);
  assert.match(plan.today.session.title, /^Minimum tempo:/);
  assert.deepEqual(plan.today.session.exercises, [['Move at your own pace', '8 min'], ['Easy mobility reset', '4 min']]);
});
test('expands today with an optional easy finisher when more time is available', () => {
  const plan = generatePlan(profile, { now: wednesday, tempoCheck: { availableMinutes: 90, energy: 'normal' } });
  assert.equal(plan.today.session.minutes, 90);
  assert.ok(plan.today.session.exercises.some(exercise => exercise[0] === 'Optional easy finisher'));
});
test('changes only today to the selected run or no-gym lift setup', () => {
  const indoorRun = generatePlan(profile, { now: wednesday, tempoCheck: { availableMinutes: 45, energy: 'normal', trainingMode: 'running', setup: 'indoor' } });
  assert.match(indoorRun.today.session.title, /^Today: Easy aerobic run/);
  assert.ok(indoorRun.today.session.exercises.some(exercise => /Treadmill/.test(exercise[0])));
  const noGymLift = generatePlan(profile, { now: wednesday, tempoCheck: { availableMinutes: 45, energy: 'normal', trainingMode: 'lifting', setup: 'no_gym' } });
  assert.match(noGymLift.today.session.title, /^Today: Full-body strength/);
  assert.ok(noGymLift.today.session.exercises.some(exercise => exercise[0] === 'Split squat'));
});

test('builds a mixed strength and aerobic week for sustainable weight management', () => {
  const plan = generatePlan({ ...profile, goal: 'lose_weight' }, { now: wednesday });
  const planned = plan.sessions.filter(session => !session.restDay);
  assert.equal(plan.prescription.label, 'Sustainable weight management');
  assert.ok(planned.some(session => /strength/i.test(session.type)));
  assert.ok(planned.some(session => /running|aerobic/i.test(session.type)));
});

test('builds a balanced general fitness prescription', () => {
  const plan = generatePlan({ ...profile, goal: 'general_fitness' }, { now: wednesday });
  assert.equal(plan.prescription.label, 'Healthy fitness');
  assert.equal(plan.prescription.metrics.length, 4);
  assert.match(plan.prescription.guidance, /150–300/);
});
test('uses logged run distance and comfortable lifting work for conservative progression suggestions', () => {
  const workouts = [
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-10T20:00:00Z', details: { running: { distance: 3 } } },
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-12T20:00:00Z', details: { running: { distance: 3 } } },
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-13T20:00:00Z', details: { lifts: [{ exercise: 'Back squat', sets: 3, reps: 10, weight: '135 lb' }] } },
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-14T20:00:00Z', details: { lifts: [{ exercise: 'Back squat', sets: 3, reps: 10, weight: '135 lb' }] } }
  ];
  const plan = generatePlan(profile, { now: wednesday, workouts });
  assert.equal(plan.dataSignals.currentMiles, 6);
  assert.equal(plan.dataSignals.runProgression, 'small-increase');
  assert.ok(plan.sessions.some(session => session.exercises.some(exercise => /optional \+2\.5 lb after two strong sessions/.test(exercise[1]))));
});

test('uses a saved starting baseline until completed workout data exists', () => {
  const plan = generatePlan({ ...profile, goal: 'run_stronger', baseline: { weeklyRunMiles: 12, longestRunMiles: 4, weeklyLiftSets: 10, averageDailySteps: 6500 } }, { now: wednesday });
  assert.equal(plan.dataSignals.baselineSource, 'user');
  assert.equal(plan.dataSignals.suggestedMiles, 12);
  assert.match(plan.prescription.headline, /12 mile/);
  const longRun = plan.sessions.find(session => session.title === 'Long easy effort');
  assert.ok(longRun.exercises.some(exercise => /4\.5 mi/.test(exercise[1])));
});

test('prefers recent logged training over a declared running baseline', () => {
  const workouts = [
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-13T20:00:00Z', details: { running: { distance: 3 } } },
    { outcome: 'completed', perceivedEffort: 5, loggedAt: '2026-07-14T20:00:00Z', details: { running: { distance: 3 } } }
  ];
  const plan = generatePlan({ ...profile, baseline: { weeklyRunMiles: 20 } }, { now: wednesday, workouts });
  assert.equal(plan.dataSignals.baselineSource, 'logged');
  assert.equal(plan.dataSignals.suggestedMiles, 6.5);
});

test('uses experience and lift type for conservative load increases', () => {
  const workouts = ['2026-07-13', '2026-07-14'].flatMap(loggedAt => [
    { outcome: 'completed', perceivedEffort: 6, loggedAt: `${loggedAt}T20:00:00Z`, details: { lifts: [{ exercise: 'Bench press', sets: 3, reps: 10, weight: '100 lb' }] } },
    { outcome: 'completed', perceivedEffort: 6, loggedAt: `${loggedAt}T21:00:00Z`, details: { lifts: [{ exercise: 'Back squat', sets: 3, reps: 10, weight: '200 lb' }] } }
  ]);
  const plan = generatePlan({ ...profile, goal: 'build_strength', trainingLevel: 'new' }, { now: wednesday, workouts });
  const exercises = plan.sessions.flatMap(session => session.exercises);
  const bench = exercises.find(exercise => exercise[0] === 'Bench press');
  const squat = exercises.find(exercise => exercise[0] === 'Back squat');
  assert.match(bench[1], /102\.5 lb/);
  assert.match(squat[1], /205 lb/);
});

test('holds lifting load when the top rep range was not repeated twice', () => {
  const workouts = [
    { outcome: 'completed', perceivedEffort: 6, loggedAt: '2026-07-13T20:00:00Z', details: { lifts: [{ exercise: 'Bench press', sets: 3, reps: 9, weight: '100 lb' }] } },
    { outcome: 'completed', perceivedEffort: 6, loggedAt: '2026-07-14T20:00:00Z', details: { lifts: [{ exercise: 'Bench press', sets: 3, reps: 10, weight: '100 lb' }] } }
  ];
  const plan = generatePlan({ ...profile, goal: 'build_strength' }, { now: wednesday, workouts });
  assert.ok(plan.sessions.some(session => session.exercises.some(exercise => exercise[0] === 'Bench press' && /repeat last load/.test(exercise[1]))));
});
