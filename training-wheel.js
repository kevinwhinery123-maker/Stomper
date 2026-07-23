const AXES = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'runVolume', label: 'Run volume' },
  { key: 'paceProgress', label: 'Pace progress' },
  { key: 'longRunBase', label: 'Long-run base' },
  { key: 'liftVolume', label: 'Lift volume' },
  { key: 'strengthProgress', label: 'Strength progress' },
  { key: 'trainingBalance', label: 'Training balance' }
];
const TRIATHLON_AXES = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'swimEndurance', label: 'Swim endurance' },
  { key: 'bikeEndurance', label: 'Bike endurance' },
  { key: 'runEndurance', label: 'Run endurance' },
  { key: 'strength', label: 'Strength' },
  { key: 'mobility', label: 'Mobility' }
];

const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const ratio = (actual, target) => target > 0 ? clamp(actual / target * 100) : null;

function dateKey(value, timezone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function numericWeight(value) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function paceSeconds(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function plannedTargets(plan) {
  const sessions = plan.sessions.filter(session => !session.restDay);
  const runSessions = sessions.filter(session => /run|aerobic|brick/i.test(`${session.type} ${session.title}`));
  const liftSessions = sessions.filter(session => /lift|strength/i.test(`${session.type} ${session.title}`));
  const swimSessions = sessions.filter(session => /swim/i.test(`${session.type} ${session.title}`));
  const bikeSessions = sessions.filter(session => /cycl|bike|brick/i.test(`${session.type} ${session.title}`));
  const brickSessions = sessions.filter(session => /brick/i.test(`${session.type} ${session.title}`));
  const mobilitySessions = sessions.filter(session => /mobility|recovery|stretch|yoga/i.test(`${session.type} ${session.title}`));
  const distances = runSessions.flatMap(session => (session.exercises || []).filter(exercise => !/brick/i.test(session.type) || /run/i.test(exercise[0]))).map(exercise => {
    const match = String(exercise[1] || '').match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    return match ? Number(match[1]) : 0;
  });
  const liftingSets = liftSessions.flatMap(session => session.exercises || []).reduce((total, exercise) => {
    const match = String(exercise[1] || '').match(/(\d+)\s*[×x]/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  const swimYards = swimSessions.flatMap(session => session.exercises || []).reduce((total, exercise) => {
    const match = String(exercise[1] || '').match(/(\d+(?:\.\d+)?)\s*yd\b/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  const bikeMiles = bikeSessions.flatMap(session => (session.exercises || []).filter(exercise => !/brick/i.test(session.type) || /bike|cycl/i.test(exercise[0]))).reduce((total, exercise) => {
    const match = String(exercise[1] || '').match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  return {
    sessions: sessions.length,
    runSessions: runSessions.length,
    liftSessions: liftSessions.length,
    swimSessions: swimSessions.length,
    bikeSessions: bikeSessions.length,
    brickSessions: brickSessions.length,
    mobilitySessions: mobilitySessions.length,
    runMiles: distances.reduce((total, miles) => total + miles, 0),
    swimYards,
    bikeMiles,
    longRunMiles: distances.length ? Math.max(...distances) : 0,
    liftingSets
  };
}

function workoutFacts(workouts, start, end, timezone) {
  const records = workouts.map(workout => ({ workout, date: dateKey(workout.loggedAt, timezone) }))
    .filter(record => record.date && record.date >= start && record.date <= end);
  const performed = records.filter(record => ['completed', 'partial'].includes(record.workout.outcome));
  const run = performed.filter(record => Number(record.workout.details?.running?.distance || 0) > 0 || /run/i.test(record.workout.type || ''));
  const lift = performed.filter(record => (record.workout.details?.lifts || []).length || /lift|strength/i.test(record.workout.type || ''));
  const swim = performed.filter(record => Number(record.workout.details?.swimming?.distanceYards || 0) > 0 || /swim/i.test(record.workout.type || ''));
  const bike = performed.filter(record => Number(record.workout.details?.cycling?.distanceMiles || 0) > 0 || /cycl|bike|brick/i.test(record.workout.type || ''));
  const brick = performed.filter(record => /brick/i.test(record.workout.type || ''));
  const mobility = performed.filter(record => /mobility|recovery|stretch|yoga/i.test(`${record.workout.type || ''} ${record.workout.title || ''}`));
  const liftSets = lift.reduce((total, record) => total + (record.workout.details?.lifts || []).reduce((sum, item) => sum + Number(item.sets || 0), 0), 0);
  const liftLoad = lift.reduce((total, record) => total + (record.workout.details?.lifts || []).reduce((sum, item) => sum + Number(item.sets || 0) * Number(item.reps || 0) * numericWeight(item.weight), 0), 0);
  const paces = run.map(record => paceSeconds(record.workout.details?.running?.averagePace)).filter(Number.isFinite);
  return {
    records, performed, run, lift, swim, bike, brick, mobility, liftSets, liftLoad, paces,
    completed: records.filter(record => record.workout.outcome === 'completed').length,
    partial: records.filter(record => record.workout.outcome === 'partial').length,
    skipped: records.filter(record => record.workout.outcome === 'skipped').length,
    activeDays: new Set(performed.map(record => record.date)).size,
    runMiles: run.reduce((total, record) => total + Number(record.workout.details?.running?.distance || 0), 0),
    swimYards: swim.reduce((total, record) => total + Number(record.workout.details?.swimming?.distanceYards || 0), 0),
    bikeMiles: bike.reduce((total, record) => total + Number(record.workout.details?.cycling?.distanceMiles || 0), 0),
    longestRun: run.reduce((longest, record) => Math.max(longest, Number(record.workout.details?.running?.distance || 0)), 0),
    highEffort: performed.filter(record => Number(record.workout.perceivedEffort) >= 8).length,
    easyEffort: performed.filter(record => Number(record.workout.perceivedEffort) > 0 && Number(record.workout.perceivedEffort) <= 6).length
  };
}

function shiftDate(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function performanceChange(current, previous, lowerIsBetter = false) {
  if (!current || !previous) return null;
  const change = (current - previous) / previous;
  return clamp(50 + (lowerIsBetter ? -change : change) * 250);
}

function buildTrainingWheel({ plan, workouts = [], previousSnapshot = null, tempoCheck = null, dailyReset = null }) {
  const timezone = plan.timezone || 'UTC';
  const triathlonMode = plan.prescription?.label === 'Triathlon training';
  const axes = triathlonMode ? TRIATHLON_AXES : AXES;
  const targets = plannedTargets(plan);
  const week = workoutFacts(workouts, plan.weekStart, plan.weekEnd, timezone);
  const prior = workoutFacts(workouts, shiftDate(plan.weekStart, -7), shiftDate(plan.weekStart, -1), timezone);
  const daysElapsed = Math.max(1, Math.min(7, Math.floor((Date.parse(`${plan.today.date}T12:00:00Z`) - Date.parse(`${plan.weekStart}T12:00:00Z`)) / 86400000) + 1));
  const elapsedShare = daysElapsed / 7;
  const runProgress = targets.runMiles ? ratio(week.runMiles, targets.runMiles) : ratio(week.run.length, targets.runSessions);
  const liftProgress = targets.liftingSets ? ratio(week.liftSets, targets.liftingSets) : ratio(week.lift.length, targets.liftSessions);
  const completedCredit = week.completed + week.partial * 0.5;
  const consistency = ratio(completedCredit, targets.sessions) ?? 0;
  const recoveryTarget = Math.max(1, Math.round(targets.sessions * elapsedShare));
  const recovery = clamp(55 + Math.min(recoveryTarget, week.easyEffort) * 15 - week.highEffort * 12 - week.skipped * 8 + (tempoCheck ? 8 : 0) + (dailyReset ? 12 : 0));
  const paceProgress = performanceChange(
    week.paces.length ? week.paces.reduce((a, b) => a + b, 0) / week.paces.length : null,
    prior.paces.length ? prior.paces.reduce((a, b) => a + b, 0) / prior.paces.length : null,
    true
  );
  const strengthProgress = performanceChange(week.liftLoad, prior.liftLoad);
  const plannedMix = targets.runSessions + targets.liftSessions;
  const actualMix = week.run.length + week.lift.length;
  const balance = !plannedMix || !actualMix ? 0 : clamp(100 - Math.abs(targets.runSessions / plannedMix - week.run.length / actualMix) * 160);
  const weekly = {
    consistency,
    recovery: week.performed.length || tempoCheck || dailyReset ? recovery : 0,
    runVolume: runProgress ?? 0,
    paceProgress: paceProgress ?? 0,
    longRunBase: targets.longRunMiles ? ratio(week.longestRun, targets.longRunMiles) : (targets.runSessions ? ratio(week.run.length, targets.runSessions) : 0),
    liftVolume: liftProgress ?? 0,
    strengthProgress: strengthProgress ?? 0,
    trainingBalance: balance
  };
  if (triathlonMode) {
    weekly.swimEndurance = targets.swimYards ? ratio(week.swimYards, targets.swimYards) : ratio(week.swim.length, targets.swimSessions) ?? 0;
    weekly.bikeEndurance = targets.bikeMiles ? ratio(week.bikeMiles, targets.bikeMiles) : ratio(week.bike.length, targets.bikeSessions) ?? 0;
    weekly.runEndurance = targets.runMiles ? ratio(week.runMiles, targets.runMiles) : ratio(week.run.length, targets.runSessions) ?? 0;
    weekly.strength = targets.liftSessions ? ratio(week.lift.length, targets.liftSessions) ?? 0 : 0;
    weekly.mobility = targets.mobilitySessions
      ? ratio(week.mobility.length + (dailyReset?.action === 'mobility' ? 1 : 0), targets.mobilitySessions) ?? 0
      : (dailyReset?.action === 'mobility' ? 100 : 0);
  }
  const availability = {
    paceProgress: paceProgress !== null,
    strengthProgress: strengthProgress !== null,
    runVolume: targets.runSessions > 0,
    longRunBase: targets.runSessions > 0,
    liftVolume: targets.liftSessions > 0
  };
  if (triathlonMode) Object.assign(availability, {
    swimEndurance: targets.swimSessions > 0,
    bikeEndurance: targets.bikeSessions > 0,
    runEndurance: targets.runSessions > 0,
    strength: targets.liftSessions > 0,
    mobility: targets.mobilitySessions > 0 || dailyReset?.action === 'mobility'
  });
  const expectedToDate = Object.fromEntries(axes.map(axis => {
    const value = weekly[axis.key];
    if (availability[axis.key] === false) return [axis.key, null];
    return [axis.key, clamp(value / Math.max(.2, elapsedShare))];
  }));
  const previousOverall = previousSnapshot?.overall || null;
  const weeksSinceSnapshot = previousSnapshot?.weekStart
    ? Math.max(1, Math.round((Date.parse(`${plan.weekStart}T12:00:00Z`) - Date.parse(`${previousSnapshot.weekStart}T12:00:00Z`)) / (7 * 86400000)))
    : 1;
  const overall = Object.fromEntries(axes.map(axis => {
    const previousAliases = { runEndurance: 'runDurability', strength: 'strengthSupport' };
    const oldValue = Number(previousOverall?.[axis.key] ?? previousOverall?.[previousAliases[axis.key]]);
    const quality = expectedToDate[axis.key];
    if (Number.isFinite(oldValue)) {
      const inactivityDecay = Math.max(0, weeksSinceSnapshot - 1) * 3;
      const decayedValue = Math.max(0, oldValue - inactivityDecay);
      if (quality === null) return [axis.key, clamp(decayedValue)];
      const candidate = decayedValue * .9 + quality * .1;
      return [axis.key, clamp(Math.max(oldValue - 4 * weeksSinceSnapshot, Math.min(oldValue + 3, candidate)))];
    }
    if (quality === null) return [axis.key, 35];
    return [axis.key, clamp(25 + quality * .45)];
  }));
  const overallScore = Math.round(axes.reduce((sum, axis) => sum + overall[axis.key], 0) / axes.length);
  const displayWeekly = Object.fromEntries(axes.map(axis => [axis.key,
    availability[axis.key] === false ? overall[axis.key] : weekly[axis.key]
  ]));
  const todaySession = plan.today.session;
  const todayRecords = week.performed.filter(record => record.date === plan.today.date);
  const todayPerformed = todayRecords.length > 0;
  const planScore = todaySession?.restDay || todaySession?.status === 'completed' || todayPerformed ? 100 : 0;
  const checkinScore = tempoCheck ? 100 : 0;
  const resetScore = dailyReset ? 100 : 0;
  const todayScore = Math.round((checkinScore + planScore + resetScore) / 3);
  const baselineWorkouts = workouts.filter(workout => ['completed', 'partial'].includes(workout.outcome)).length;
  return {
    version: 1,
    axes,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    weekly,
    displayWeekly,
    overall,
    overallScore,
    status: baselineWorkouts >= 2 ? 'active' : 'building-baseline',
    availability,
    targets,
    today: {
      score: todayScore,
      checkin: { score: checkinScore, completed: Boolean(tempoCheck) },
      plan: { score: planScore, restDay: Boolean(todaySession?.restDay) },
      reset: { score: resetScore, action: dailyReset?.action || null },
      label: todayScore === 100 ? 'All three Tempo rings are complete.' : todaySession?.restDay ? 'Your Plan ring is complete. Check in and choose a Reset when you are ready.' : 'Check in, follow today’s plan, and finish with a Reset.'
    },
    note: 'Overall scores move gradually and ease back after inactive weeks. Weekly progress compares logged work with this week’s plan.'
  };
}

module.exports = { AXES, TRIATHLON_AXES, buildTrainingWheel };
