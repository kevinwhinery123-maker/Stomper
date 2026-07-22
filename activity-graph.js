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
    walk: { key: 'walk', label: 'Walk', unit: 'steps', shortUnit: 'steps', recommended: Number(plan.baseline?.averageDailySteps) > 0 ? Math.round(Math.min(Number(plan.baseline.averageDailySteps) * 1.05, Number(plan.baseline.averageDailySteps) + 500)) : 8000 },
    lift: { key: 'lift', label: 'Lift', unit: 'sets', shortUnit: 'sets', recommended: Math.round(todayLift || average(plannedLifts, /(\d+)\s*[×x]/i)) }
  };
  Object.values(series).forEach(item => {
    item.values = days.map(day => round(day[item.key], item.key === 'run' ? 2 : 0));
    item.total = round(item.values.reduce((sum, value) => sum + value, 0), item.key === 'run' ? 2 : 0);
  });
  return { version: 1, weekStart: plan.weekStart, weekEnd: plan.weekEnd, todayDate: plan.today.date, days: days.map(day => ({ date: day.date, day: day.day })), series };
}

function addUtcDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(dateKey, monthOnly = false) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', monthOnly ? { month: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function metricTotals(workout) {
  return {
    run: Math.max(0, Number(workout.details?.running?.distance) || 0),
    walk: Math.max(0, Number(workout.details?.steps || workout.details?.activity?.steps) || 0),
    lift: (workout.details?.lifts || []).reduce((sets, lift) => sets + Math.max(0, Number(lift.sets) || 0), 0)
  };
}

function buildActivityGraphRange(plan, workouts = [], window = {}) {
  if (!window.range || window.range === 'week') return buildActivityGraph(plan, workouts);
  const start = window.start;
  const end = window.end;
  const timezone = plan.timezone || 'UTC';
  const buckets = [];
  if (window.range === 'month') {
    for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 7)) {
      const bucketEnd = addUtcDays(cursor, 6);
      buckets.push({ start: cursor, end: bucketEnd > end ? end : bucketEnd, day: displayDate(cursor), run: 0, walk: 0, lift: 0 });
    }
  } else {
    let cursor = start.slice(0, 7) + '-01';
    while (cursor <= end) {
      const monthStart = cursor < start ? start : cursor;
      const nextMonth = new Date(`${cursor}T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const nextKey = nextMonth.toISOString().slice(0, 10);
      const naturalEnd = addUtcDays(nextKey, -1);
      buckets.push({ start: monthStart, end: naturalEnd > end ? end : naturalEnd, day: displayDate(cursor, true), run: 0, walk: 0, lift: 0 });
      cursor = nextKey;
    }
  }
  workouts.filter(workout => ['completed', 'partial'].includes(workout.outcome)).forEach(workout => {
    const date = localDateKey(workout.loggedAt, timezone);
    const bucket = buckets.find(item => date >= item.start && date <= item.end);
    if (!bucket) return;
    const totals = metricTotals(workout);
    bucket.run += totals.run;
    bucket.walk += totals.walk;
    bucket.lift += totals.lift;
  });
  const weekly = buildActivityGraph(plan, []);
  const plannedRuns = plan.sessions.filter(session => !session.restDay && /run|aerobic/i.test(`${session.type} ${session.title}`)).length;
  const plannedLifts = plan.sessions.filter(session => !session.restDay && /lift|strength/i.test(`${session.type} ${session.title}`)).length;
  const weeklyGuides = {
    run: Number(plan.dataSignals?.suggestedMiles) || weekly.series.run.recommended * Math.max(1, plannedRuns),
    walk: weekly.series.walk.recommended * 7,
    lift: weekly.series.lift.recommended * Math.max(1, plannedLifts)
  };
  const periodMultiplier = window.range === 'month' ? 1 : 4.345;
  const series = {};
  Object.values(weekly.series).forEach(item => {
    series[item.key] = {
      ...item,
      recommended: round(weeklyGuides[item.key] * periodMultiplier, item.key === 'run' ? 1 : 0),
      values: buckets.map(bucket => round(bucket[item.key], item.key === 'run' ? 2 : 0))
    };
    series[item.key].total = round(series[item.key].values.reduce((sum, value) => sum + value, 0), item.key === 'run' ? 2 : 0);
  });
  return {
    version: 2,
    range: window.range,
    rangeStart: start,
    rangeEnd: end,
    todayDate: plan.today.date,
    days: buckets.map(bucket => ({ date: bucket.start, day: bucket.day })),
    series
  };
}

module.exports = { buildActivityGraph, buildActivityGraphRange };
