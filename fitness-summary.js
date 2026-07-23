const RUN_PATTERN = /run|jog|treadmill/i;
const LIFT_PATTERN = /lift|strength|weight|crossfit/i;
const SWIM_PATTERN = /swim|open water/i;
const BIKE_PATTERN = /bike|cycling|ride|brick/i;

function localDateKey(value, timezone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function classify(workout) {
  const type = String(workout.type || 'other');
  const runDistance = Number(workout.details?.running?.distance || 0);
  const swimDistance = Number(workout.details?.swimming?.distanceYards || 0);
  const bikeDistance = Number(workout.details?.cycling?.distanceMiles || 0);
  const lifts = Array.isArray(workout.details?.lifts) ? workout.details.lifts : [];
  return {
    isRun: runDistance > 0 || RUN_PATTERN.test(type),
    isLift: lifts.length > 0 || LIFT_PATTERN.test(type),
    isSwim: swimDistance > 0 || SWIM_PATTERN.test(type),
    isBike: bikeDistance > 0 || BIKE_PATTERN.test(type),
    runDistance: Number.isFinite(runDistance) && runDistance > 0 ? runDistance : 0,
    swimDistance: Number.isFinite(swimDistance) && swimDistance > 0 ? swimDistance : 0,
    bikeDistance: Number.isFinite(bikeDistance) && bikeDistance > 0 ? bikeDistance : 0,
    lifts
  };
}

function summarizeWindow(records, start, end) {
  const inside = records.filter(record => record.date >= start && record.date <= end);
  const performed = inside.filter(record => ['completed', 'partial'].includes(record.workout.outcome));
  const efforts = performed.map(record => Number(record.workout.perceivedEffort)).filter(value => Number.isFinite(value) && value >= 1 && value <= 10);
  const runRecords = performed.filter(record => record.kind.isRun);
  const liftRecords = performed.filter(record => record.kind.isLift);
  const swimRecords = performed.filter(record => record.kind.isSwim);
  const bikeRecords = performed.filter(record => record.kind.isBike);
  const liftingSets = liftRecords.reduce((total, record) => total + record.kind.lifts.reduce((sets, lift) => sets + Math.max(0, Number(lift.sets) || 0), 0), 0);
  return {
    start, end,
    completedSessions: inside.filter(record => record.workout.outcome === 'completed').length,
    partialSessions: inside.filter(record => record.workout.outcome === 'partial').length,
    skippedSessions: inside.filter(record => record.workout.outcome === 'skipped').length,
    activeDays: new Set(performed.map(record => record.date)).size,
    trainingMinutes: Math.round(performed.reduce((total, record) => total + Math.max(0, Number(record.workout.durationMinutes) || 0), 0)),
    runningSessions: runRecords.length,
    runningMiles: round(runRecords.reduce((total, record) => total + record.kind.runDistance, 0), 2),
    swimmingSessions: swimRecords.length,
    swimmingYards: Math.round(swimRecords.reduce((total, record) => total + record.kind.swimDistance, 0)),
    cyclingSessions: bikeRecords.length,
    cyclingMiles: round(bikeRecords.reduce((total, record) => total + record.kind.bikeDistance, 0), 2),
    liftingSessions: liftRecords.length,
    liftingSets: Math.round(liftingSets),
    averageEffort: efforts.length ? round(efforts.reduce((total, effort) => total + effort, 0) / efforts.length, 1) : null,
    highEffortSessions: efforts.filter(effort => effort >= 8).length
  };
}

function compare(current, previous, unit) {
  const currentValue = Number(current || 0), previousValue = Number(previous || 0);
  if (!currentValue && !previousValue) return { direction: 'no-data', change: 0, description: `No ${unit} recorded in either recent week.` };
  if (currentValue && !previousValue) return { direction: 'started', change: null, description: `${round(currentValue, 1)} ${unit} recorded after none in the prior week.` };
  const percent = round(((currentValue - previousValue) / previousValue) * 100, 0);
  const direction = Math.abs(percent) < 10 ? 'steady' : percent > 0 ? 'higher' : 'lower';
  return { direction, change: percent, description: direction === 'steady' ? `${unit} stayed close to the prior week.` : `${unit} are ${Math.abs(percent)}% ${direction} than the prior week.` };
}

function strengthHighlights(records, start, end) {
  const exercises = new Map();
  records.filter(record => record.date >= start && record.date <= end && ['completed', 'partial'].includes(record.workout.outcome)).forEach(record => {
    record.kind.lifts.forEach(lift => {
      const name = String(lift.exercise || '').trim();
      if (!name) return;
      const key = name.toLowerCase(), existing = exercises.get(key) || { exercise: name, sessions: new Set(), sets: 0, latest: null };
      existing.sessions.add(record.date);
      existing.sets += Math.max(0, Number(lift.sets) || 0);
      if (!existing.latest || record.date > existing.latest.date) existing.latest = { date: record.date, sets: Number(lift.sets) || 0, reps: Number(lift.reps) || 0, weight: String(lift.weight || '').trim() };
      exercises.set(key, existing);
    });
  });
  return [...exercises.values()].sort((a, b) => b.sets - a.sets).slice(0, 6).map(item => ({ exercise: item.exercise, sessions: item.sessions.size, sets: item.sets, latest: item.latest }));
}

function buildFitnessSummary(workouts = [], options = {}) {
  const timezone = options.timezone || 'UTC', today = localDateKey(options.now || new Date(), timezone);
  const records = workouts.map(workout => ({ workout, date: localDateKey(workout.loggedAt, timezone), kind: classify(workout) })).filter(record => record.date && record.date <= today);
  const current7 = summarizeWindow(records, shiftDate(today, -6), today);
  const previous7 = summarizeWindow(records, shiftDate(today, -13), shiftDate(today, -7));
  const recent28 = summarizeWindow(records, shiftDate(today, -27), today);
  const performed28 = records.filter(record => record.date >= recent28.start && record.date <= today && ['completed', 'partial'].includes(record.workout.outcome));
  const runDistances = performed28.filter(record => record.kind.isRun && record.kind.runDistance > 0).map(record => record.kind.runDistance);
  const logged28 = recent28.completedSessions + recent28.partialSessions + recent28.skippedSessions;
  const sources = [...new Set(performed28.map(record => String(record.workout.source || 'manual')))];
  const dataQuality = {
    level: performed28.length >= 8 ? 'strong' : performed28.length >= 3 ? 'growing' : 'limited',
    performedWorkouts: performed28.length,
    effortCoverage: performed28.length ? round(performed28.filter(record => Number(record.workout.perceivedEffort) >= 1).length / performed28.length * 100, 0) : 0,
    runDistanceCoverage: recent28.runningSessions ? round(performed28.filter(record => record.kind.isRun && record.kind.runDistance > 0).length / recent28.runningSessions * 100, 0) : 0,
    liftDetailCoverage: recent28.liftingSessions ? round(performed28.filter(record => record.kind.isLift && record.kind.lifts.length > 0).length / recent28.liftingSessions * 100, 0) : 0,
    sources
  };
  const trends = {
    swimmingYards: compare(current7.swimmingYards, previous7.swimmingYards, 'swimming yards'),
    cyclingMiles: compare(current7.cyclingMiles, previous7.cyclingMiles, 'cycling miles'),
    runningMiles: compare(current7.runningMiles, previous7.runningMiles, 'running miles'),
    trainingMinutes: compare(current7.trainingMinutes, previous7.trainingMinutes, 'training minutes')
  };
  const signals = [];
  if (dataQuality.level === 'limited') signals.push('There is not enough recent data for a confident progression recommendation yet.');
  else signals.push(`${recent28.activeDays} active days were recorded in the last 28 days.`);
  if (current7.highEffortSessions) signals.push(`${current7.highEffortSessions} high-effort ${current7.highEffortSessions === 1 ? 'session was' : 'sessions were'} recorded this week; avoid automatically increasing the next demanding workout.`);
  if (trends.runningMiles.direction === 'higher') signals.push('Recent running mileage is meaningfully higher than the prior week; hold or progress cautiously.');
  if (recent28.skippedSessions || recent28.partialSessions) signals.push(`${recent28.partialSessions + recent28.skippedSessions} recent ${recent28.partialSessions + recent28.skippedSessions === 1 ? 'session was' : 'sessions were'} partial or skipped; the next plan should prioritize realistic completion.`);
  if (dataQuality.effortCoverage < 50 && performed28.length >= 3) signals.push('Effort ratings are missing from most recent workouts, so fatigue cannot be estimated reliably.');
  if (!signals.length) signals.push('Keep logging completed work and effort so recommendations can become more specific.');
  return {
    version: 1, asOf: today, timezone,
    windows: { current7, previous7, recent28 },
    trends,
    highlights: { longestRunMiles: runDistances.length ? round(Math.max(...runDistances), 2) : null, strength: strengthHighlights(records, recent28.start, today) },
    consistency: { recordedSessions: logged28, completionRate: logged28 ? round(recent28.completedSessions / logged28 * 100, 0) : null },
    dataQuality,
    coachingSignals: signals
  };
}

module.exports = { buildFitnessSummary, localDateKey };
