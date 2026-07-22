const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivityGraph } = require('../activity-graph');

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
