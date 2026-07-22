const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivityGraph, buildActivityGraphRange } = require('../activity-graph');

const sessions = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, index) => ({
  day, date: `2026-07-${String(20 + index).padStart(2, '0')}`, restDay: true, type: 'Rest', title: 'Rest', exercises: []
}));
sessions[0] = { ...sessions[0], restDay: false, type: 'Running', title: 'Easy run', exercises: [['Run', '3 mi']] };
sessions[2] = { ...sessions[2], restDay: false, type: 'Strength', title: 'Strength', exercises: [['Squat', '3 × 8'], ['Row', '3 × 8']] };
const plan = { timezone: 'UTC', weekStart: '2026-07-20', weekEnd: '2026-07-26', sessions, today: { session: sessions[2] } };

test('builds daily run, walk, and lift graph series', () => {
  const graph = buildActivityGraph(plan, [
    { outcome: 'completed', loggedAt: '2026-07-20T12:00:00Z', details: { running: { distance: 3.2 } } },
    { outcome: 'completed', loggedAt: '2026-07-21T12:00:00Z', details: { steps: 7200 } },
    { outcome: 'completed', loggedAt: '2026-07-22T12:00:00Z', details: { lifts: [{ sets: 4 }, { sets: 3 }] } }
  ]);
  assert.equal(graph.series.run.values[0], 3.2);
  assert.equal(graph.series.walk.values[1], 7200);
  assert.equal(graph.series.lift.values[2], 7);
  assert.equal(graph.series.lift.recommended, 6);
  assert.equal(graph.series.walk.recommended, 8000);
});

test('combines monthly activity into readable weekly graph points', () => {
  const graph = buildActivityGraphRange(plan, [
    { outcome: 'completed', loggedAt: '2026-07-02T12:00:00Z', details: { running: { distance: 2 } } },
    { outcome: 'completed', loggedAt: '2026-07-09T12:00:00Z', details: { running: { distance: 4 } } },
    { outcome: 'completed', loggedAt: '2026-07-18T12:00:00Z', details: { steps: 9000 } }
  ], { range: 'month', start: '2026-07-01', end: '2026-07-22' });
  assert.deepEqual(graph.days.map(day => day.day), ['Jul 1', 'Jul 8', 'Jul 15', 'Jul 22']);
  assert.deepEqual(graph.series.run.values, [2, 4, 0, 0]);
  assert.equal(graph.series.run.total, 6);
  assert.equal(graph.series.run.recommended, 3);
  assert.equal(graph.series.walk.values[2], 9000);
});

test('builds the walking guide from the user baseline when available', () => {
  const graph = buildActivityGraph({ ...plan, baseline: { averageDailySteps: 6500 } }, []);
  assert.equal(graph.series.walk.recommended, 6825);
});
