const { localDateKey } = require('./fitness-summary');

const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function exerciseNumber(session, pattern) {
  return (session?.exercises || []).reduce((total, exercise) => {
    const match = String(exercise[1] || '').match(pattern);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
}

function buildActivityGraph(plan, workouts = []) {
  const timezone = plan.timezone || 'UTC';
  const days = plan.sessions.map(session => ({ date: session.date, day: session.day, run: 0, walk: 0, lift: 0 }));
  const byDate = new Map(days.map(day => [day.date, day]));
  workouts.filter(workout => ['completed', 'partial'].includes(workout.outcome)).forEach(workout => {
    const day = byDate.get(localDateKey(workout.loggedAt, timezone));
    if (!day) return;
    day.run += Math.max(0, Number(workout.details?.running?.distance) || 0);
    day.walk += Math.max(0, Number(workout.details?.steps || workout.details?.activity?.steps) || 0);
    day.lift += (workout.details?.lifts || []).reduce((sets, lift) => sets + Math.max(0, Number(lift.sets) || 0), 0);
  });
  const plannedRuns = plan.sessions.filter(session => !session.restDay && /run|aerobic/i.test(`${session.type} ${session.title}`));
  const plannedLifts = plan.sessions.filter(session => !session.restDay && /lift|strength/i.test(`${session.type} ${session.title}`));
  const todayRun = /run|aerobic/i.test(`${plan.today.session?.type} ${plan.today.session?.title}`) ? exerciseNumber(plan.today.session, /(\d+(?:\.\d+)?)\s*mi\b/i) : 0;
  const todayLift = /lift|strength/i.test(`${plan.today.session?.type} ${plan.today.session?.title}`) ? exerciseNumber(plan.today.session, /(\d+)\s*[×x]/i) : 0;
  const average = (sessions, pattern) => sessions.length ? sessions.reduce((sum, session) => sum + exerciseNumber(session, pattern), 0) / sessions.length : 0;
  const series = {
    run: { key: 'run', label: 'Run', unit: 'miles', shortUnit: 'mi', recommended: round(todayRun || average(plannedRuns, /(\d+(?:\.\d+)?)\s*mi\b/i), 1) },
    walk: { key: 'walk', label: 'Walk', unit: 'steps', shortUnit: 'steps', recommended: 8000 },
    lift: { key: 'lift', label: 'Lift', unit: 'sets', shortUnit: 'sets', recommended: Math.round(todayLift || average(plannedLifts, /(\d+)\s*[×x]/i)) }
  };
  Object.values(series).forEach(item => {
    item.values = days.map(day => round(day[item.key], item.key === 'run' ? 2 : 0));
    item.total = round(item.values.reduce((sum, value) => sum + value, 0), item.key === 'run' ? 2 : 0);
  });
  return { version: 1, weekStart: plan.weekStart, weekEnd: plan.weekEnd, todayDate: plan.today.date, days: days.map(day => ({ date: day.date, day: day.day })), series };
}

module.exports = { buildActivityGraph };
