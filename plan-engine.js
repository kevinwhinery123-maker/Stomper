/**
 * Date-aware, rules-based plan generator.
 * It has no database knowledge: the server supplies the profile, workout logs,
 * and the time a session was missed. That keeps its behavior easy to test.
 */
const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function localParts(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: parts.weekday };
}
function dateKey({ year, month, day }) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function addDays(parts, days) { const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
function formatDate(parts, timezone) { return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))); }
function template(title, type, intensity, exercises) { return { title, type, intensity, exercises }; }
function alternativesFor(session) {
  const strength = [
    { id: 'full-body', title: 'Full-body strength', type: 'Strength', intensity: 'Moderate', exercises: [['Goblet squat or leg press', '3 × 8'], ['Push movement', '3 × 8'], ['Row movement', '3 × 8']] },
    { id: 'upper-body', title: 'Upper body + core', type: 'Strength', intensity: 'Moderate', exercises: [['Push movement', '3 × 8'], ['Row movement', '3 × 8'], ['Core work', '2 rounds']] },
    { id: 'mobility', title: 'Mobility + core reset', type: 'Recovery', intensity: 'Easy', exercises: [['Mobility flow', '15 min'], ['Core work', '2 rounds'], ['Easy walk', '10 min']] }
  ];
  const running = [
    { id: 'easy-run', title: 'Easy aerobic run', type: 'Running', intensity: 'Easy', exercises: [['Easy run or walk-run', '30 min'], ['Mobility reset', '8 min']] },
    { id: 'hill-run', title: 'Hill repeats', type: 'Running', intensity: 'Moderate', exercises: [['Warm-up jog', '10 min'], ['Hill repeats', '6 × 45 sec'], ['Cool-down', '10 min']] },
    { id: 'walk-run', title: 'Walk-run reset', type: 'Running', intensity: 'Easy', exercises: [['Walk-run intervals', '25 min'], ['Light stretching', '5 min']] }
  ];
  if (/running/i.test(session.type) && !/strength/i.test(session.type)) return running;
  if (/strength/i.test(session.type) && !/running/i.test(session.type)) return strength;
  return [strength[0], running[0], strength[2]];
}

function workoutTemplates(profile) {
  const level = profile.trainingLevel;
  const minutes = Math.max(30, Math.min(Number(profile.sessionMinutes) || 45, 75));
  const strengthSets = level === 'new' ? '2 × 8' : level === 'advanced' ? '4 × 6' : '3 × 8';
  const strengthMove = profile.equipment === 'bodyweight' ? 'Split squat' : profile.equipment === 'home_gym' ? 'Goblet squat' : 'Back squat';
  const strength = template('Lower body + intervals', 'Strength and running', 'Moderate', [[strengthMove, strengthSets], ['Romanian deadlift', level === 'new' ? '2 × 8' : '3 × 8'], ['Run intervals', level === 'new' ? '4 × 1 min' : '4 × 2 min']]);
  const easyRun = template('Easy aerobic run', 'Running', 'Easy', [['Easy run', `${Math.min(minutes, 40)} min`], ['Mobility reset', '8 min']]);
  const fullBody = template('Full-body strength', 'Strength', 'Moderate', [['Push movement', strengthSets], ['Hip hinge', strengthSets], ['Row movement', strengthSets]]);
  const longRun = template('Long easy effort', 'Running', 'Easy', [['Easy run or walk-run', `${Math.min(minutes + 10, 75)} min`], ['Optional mobility', '8 min']]);
  if (profile.goal === 'build_strength') return [template('Lower-body strength', 'Strength', 'Moderate', [[strengthMove, strengthSets], ['Hip hinge', strengthSets], ['Core work', '2 rounds']]), template('Upper-body strength', 'Strength', 'Moderate', [['Push movement', strengthSets], ['Row movement', strengthSets], ['Carry or plank', '2 rounds']]), fullBody, template('Mobility + core', 'Recovery', 'Easy', [['Mobility flow', '15 min'], ['Core work', '2 rounds']])];
  if (profile.goal === 'run_stronger') return [template('Run intervals', 'Running', 'Moderate', [['Warm-up jog', '10 min'], ['Intervals', level === 'new' ? '4 × 1 min' : '4 × 2 min'], ['Cool-down', '10 min']]), easyRun, longRun, template('Run drills + strength', 'Running support', 'Easy', [['Run drills', '10 min'], ['Bodyweight strength', '15 min']])];
  return [strength, easyRun, fullBody, longRun];
}
function plannedSession(day, date, plan, minutes) { return { id: `${date}-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day, date, dateLabel: day, title: plan.title, type: plan.type, minutes, intensity: plan.intensity, exercises: plan.exercises, status: 'upcoming' }; }
function applyFeedbackAdjustment(sessions, workouts, todayKey, weekStartKey) {
  const recent = workouts.filter(workout => { const logged = new Date(workout.loggedAt); return !Number.isNaN(logged); });
  const latest = [...recent].sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0];
  const remaining = sessions.filter(session => ['today', 'upcoming'].includes(session.status));
  const skippedRecently = recent.filter(workout => workout.outcome === 'skipped').length;
  const comfortable = recent.filter(workout => workout.outcome === 'completed' && Number(workout.perceivedEffort) > 0 && Number(workout.perceivedEffort) <= 5);
  if (!remaining.length) return null;
  if (latest && latest.outcome === 'completed' && Number(latest.perceivedEffort) >= 9) {
    const target = remaining.find(session => session.intensity !== 'Easy') || remaining[0];
    target.title = `Recovery-adjusted: ${target.title}`; target.type = 'Recovery'; target.intensity = 'Easy'; target.minutes = Math.min(target.minutes, 25); target.exercises = [['Easy walk, bike, or mobility', '15 min'], ['Light stretching', '5 min']]; target.adjusted = true;
    return { type: 'recovery', message: 'Your last workout was rated very hard, so the next demanding session was changed to a short recovery day. This protects consistency instead of pushing through accumulated fatigue.' };
  }
  if (skippedRecently >= 2) {
    remaining.forEach(session => { session.minutes = Math.max(20, Math.round(session.minutes * 0.75)); session.title = `Reduced: ${session.title}`; session.adjusted = true; });
    return { type: 'reduced', message: 'Two or more recent skips suggest the current workload may not fit real life. Remaining sessions are shorter this week so the plan is easier to restart.' };
  }
  if (comfortable.length >= 3 && comfortable.slice(0, 3).every(workout => Number(workout.perceivedEffort) <= 5)) {
    const target = remaining.find(session => session.intensity === 'Moderate') || remaining[0];
    target.exercises = [...target.exercises, ['Gentle progression', 'Add 1 rep or 5 min only if form feels strong']]; target.adjusted = true;
    return { type: 'progression', message: 'Several recent workouts felt manageable, so the next moderate session includes one small progression. It is optional and should not compromise form or recovery.' };
  }
  return null;
}

function generatePlan(profile, options = {}) {
  const now = options.now || new Date();
  const timezone = profile.timezone || 'UTC';
  const today = localParts(now, timezone);
  const todayKey = dateKey(today);
  const todayIndex = weekdayOrder.indexOf(today.weekday);
  const weekStart = addDays(today, -todayIndex);
  const selectedDays = [...new Set(profile.trainingDays || [])].filter(day => weekdayOrder.includes(day)).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
  const templates = workoutTemplates(profile);
  const minutes = Math.max(30, Math.min(Number(profile.sessionMinutes) || 45, 75));
  const sessions = selectedDays.map((day, index) => {
    const date = dateKey(addDays(weekStart, weekdayOrder.indexOf(day)));
    const session = plannedSession(day, date, templates[index % templates.length], minutes);
    session.dateLabel = formatDate(addDays(weekStart, weekdayOrder.indexOf(day)), timezone);
    return session;
  });
  const overrides = new Map((options.overrides || []).map(override => [override.date, override]));
  sessions.forEach(session => { const override = overrides.get(session.date); if (override) { session.title = override.title; session.type = override.type; session.intensity = override.intensity; session.exercises = override.exercises; session.customized = true; session.selectedAlternative = override.alternativeId; } });
  const workouts = options.workouts || [];
  const completedDates = new Set(workouts.filter(workout => workout.source === 'plan' && workout.outcome === 'completed').map(workout => dateKey(localParts(new Date(workout.loggedAt), timezone))));
  sessions.forEach(session => { if (completedDates.has(session.date)) session.status = 'completed'; else if (session.date < todayKey) session.status = 'missed'; else if (session.date === todayKey) session.status = 'today'; });

  const feedbackAdjustment = applyFeedbackAdjustment(sessions, workouts, todayKey, dateKey(weekStart));

  const missedDate = options.missedToday?.at ? dateKey(localParts(new Date(options.missedToday.at), timezone)) : null;
  const isCurrentWeekMiss = missedDate && missedDate >= dateKey(weekStart) && missedDate <= dateKey(addDays(weekStart, 6));
  let adjustment = null;
  if (isCurrentWeekMiss) {
    const missedIndex = sessions.findIndex(session => session.date === missedDate);
    if (missedIndex >= 0 && sessions[missedIndex].status !== 'completed') {
      const missed = sessions[missedIndex]; missed.status = 'missed';
      const nextIndex = sessions.findIndex((session, index) => index > missedIndex && session.date >= todayKey && session.status !== 'completed');
      if (nextIndex >= 0) {
        sessions[nextIndex] = { ...sessions[nextIndex], title: 'Recovery + movement reset', type: 'Recovery', intensity: 'Easy', minutes: 20, exercises: [['Walk, bike, or mobility', '15 min'], ['Light stretching', '5 min']], adjusted: true };
        const followingIndex = sessions.findIndex((session, index) => index > nextIndex && session.date >= todayKey && session.status !== 'completed');
        if (followingIndex >= 0) sessions[followingIndex] = { ...sessions[followingIndex], title: `Rescheduled: ${missed.title}`, minutes: Math.min(missed.minutes, 45), exercises: [...missed.exercises.slice(0, 2), ['Core or mobility', '2 rounds']], adjusted: true };
        adjustment = 'A missed session is handled with an easier re-entry day first. The most valuable work returns on the following training day, without stacking two hard sessions together.';
      }
    }
  }
  const title = profile.goal === 'build_strength' ? 'A stronger week, built around your schedule.' : profile.goal === 'both' ? 'Strength and running, aligned to your week.' : 'A running week with strength behind it.';
  const todaySession = sessions.find(session => session.date === todayKey) || null;
  const weekStartKey = dateKey(weekStart), weekEndKey = dateKey(addDays(weekStart, 6));
  const trainingMinutes = workouts.filter(workout => { const date = dateKey(localParts(new Date(workout.loggedAt), timezone)); return workout.outcome === 'completed' && date >= weekStartKey && date <= weekEndKey; }).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const todayMinutes = workouts.filter(workout => workout.outcome === 'completed' && dateKey(localParts(new Date(workout.loggedAt), timezone)) === todayKey).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const calendar = weekdayOrder.map((day, index) => { const parts = addDays(weekStart, index); const scheduled = sessions.find(session => session.day === day); return { day, date: dateKey(parts), dateLabel: formatDate(parts, timezone), status: scheduled ? scheduled.status : 'rest' }; });
  sessions.forEach(session => { session.alternatives = alternativesFor(session); });
  const allAdjustments = [adjustment, feedbackAdjustment?.message].filter(Boolean);
  return { title, timezone, weekStart: weekStartKey, weekEnd: weekEndKey, today: { date: todayKey, label: formatDate(today, timezone), session: todaySession }, weekLabel: `${formatDate(weekStart, timezone)} – ${formatDate(addDays(weekStart, 6), timezone)}`, sessions, calendar, summary: { completed: sessions.filter(session => session.status === 'completed').length, planned: sessions.length, trainingMinutes, todayMinutes }, adjustment: allAdjustments.length ? allAdjustments.join(' ') : null, feedbackAdjustment, why: [`Your selected days (${selectedDays.join(', ') || 'none'}) create the week’s rhythm.`, `This plan reflects a ${profile.trainingLevel} starting point and ${profile.equipment.replace('_', ' ')} access.`, feedbackAdjustment ? 'Recent workout feedback adjusted only the remaining sessions. Tell us when it feels wrong—this is what the beta is for.' : adjustment ? 'The current-week miss changes only the remaining sessions; a new week starts clean.' : 'Completed and missed sessions are based on the current date in your saved timezone.'] };
}

module.exports = { generatePlan, localParts, dateKey };
