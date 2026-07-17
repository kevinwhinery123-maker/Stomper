/**
 * Date-aware, rules-based plan generator.
 * The server supplies profile and activity history; this module stays deterministic
 * so every recommendation can be tested and explained.
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
function roundMiles(value) { return Math.round(Number(value || 0) * 4) / 4; }
function workoutDate(workout, timezone) { const date = new Date(workout.loggedAt); return Number.isNaN(date) ? null : dateKey(localParts(date, timezone)); }
function numericWeight(value) { const match = String(value || '').match(/\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function formatWeight(value) { const number = numericWeight(value); return number === null ? String(value || '').trim() : `${number} lb`; }
function compactExercises(exercises, minutes) { return exercises.slice(0, minutes <= 30 ? 3 : minutes <= 45 ? 4 : exercises.length); }

function buildTrainingSignals(profile, workouts, now, timezone) {
  const today = localParts(now, timezone), todayKey = dateKey(today);
  const recentStart = dateKey(addDays(today, -6)), previousStart = dateKey(addDays(today, -13)), previousEnd = dateKey(addDays(today, -7)), liftStart = dateKey(addDays(today, -27));
  const completed = workouts.filter(workout => workout.outcome === 'completed' && workoutDate(workout, timezone));
  let currentMiles = 0, previousMiles = 0, currentRunCount = 0;
  const lifts = new Map();
  const recentEfforts = [];
  completed.forEach(workout => {
    const date = workoutDate(workout, timezone), running = workout.details?.running || {};
    const distance = Number(running.distance || 0);
    if (date >= recentStart && date <= todayKey && Number.isFinite(distance) && distance > 0) { currentMiles += distance; currentRunCount++; }
    if (date >= previousStart && date <= previousEnd && Number.isFinite(distance) && distance > 0) previousMiles += distance;
    if (date >= recentStart && date <= todayKey && Number(workout.perceivedEffort) > 0) recentEfforts.push(Number(workout.perceivedEffort));
    if (date < liftStart) return;
    (workout.details?.lifts || []).forEach(lift => {
      const name = String(lift.exercise || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const record = lifts.get(key) || { name, entries: [], sets: 0 };
      record.entries.push({ date, sets: Number(lift.sets || 0), reps: Number(lift.reps || 0), weight: String(lift.weight || '').trim(), effort: Number(workout.perceivedEffort || 0) || null });
      record.sets += Number(lift.sets || 0);
      lifts.set(key, record);
    });
  });
  lifts.forEach(record => record.entries.sort((a, b) => b.date.localeCompare(a.date)));
  currentMiles = roundMiles(currentMiles); previousMiles = roundMiles(previousMiles);
  const hardRecent = recentEfforts.some(effort => effort >= 8);
  const baselineMiles = currentMiles || previousMiles;
  let suggestedMiles = baselineMiles, runProgression = 'none';
  if (baselineMiles && currentRunCount >= 2 && !hardRecent) { suggestedMiles = roundMiles(Math.min(baselineMiles * 1.05, baselineMiles + 0.5)); runProgression = suggestedMiles > baselineMiles ? 'small-increase' : 'repeat'; }
  else if (baselineMiles) runProgression = hardRecent ? 'repeat-after-hard-week' : 'repeat';
  return { recentStart, currentMiles, previousMiles, currentRunCount, suggestedMiles, runProgression, hardRecent, lifts: [...lifts.values()] };
}

function findLift(signals, aliases) { return signals.lifts.find(record => aliases.some(alias => record.name.toLowerCase().includes(alias))); }
function loadPrescription(signals, aliases, fallbackName, sets, reps) {
  const record = findLift(signals, aliases);
  const latest = record?.entries[0];
  if (!latest?.weight) return [record?.name || fallbackName, `${sets} × ${reps}`];
  const readyToProgress = record.entries.length >= 2 && !signals.hardRecent && latest.effort !== null && latest.effort <= 6 && numericWeight(latest.weight) !== null;
  if (readyToProgress) return [record.name, `${sets} × ${reps} @ ${formatWeight(numericWeight(latest.weight) + 5)} · optional +5 lb`];
  return [record.name, `${sets} × ${reps} @ ${formatWeight(latest.weight)} · repeat last load`];
}
function strengthSetup(profile, signals) {
  const sets = profile.trainingLevel === 'new' ? 2 : profile.trainingLevel === 'advanced' ? 4 : 3;
  const squatName = profile.equipment === 'bodyweight' ? 'Split squat' : profile.equipment === 'home_gym' ? 'Goblet squat' : 'Back squat';
  return { sets, reps: profile.trainingLevel === 'advanced' ? '6–8' : '8–10', squat: loadPrescription(signals, ['squat', 'leg press'], squatName, sets, profile.trainingLevel === 'advanced' ? '6–8' : '8–10'), hinge: loadPrescription(signals, ['deadlift', 'hip thrust', 'hinge'], 'Romanian deadlift', sets, '8–10'), push: loadPrescription(signals, ['bench', 'push-up', 'press'], 'Bench press or push-up', sets, '8–10'), pull: loadPrescription(signals, ['row', 'pull-down', 'pulldown'], 'Row movement', sets, '8–12') };
}
function runBlock(label, minutes, share, signals, detail) {
  if (!signals.suggestedMiles) return [label, `${minutes} min${detail ? ` · ${detail}` : ''}`];
  return [label, `${Math.max(0.5, roundMiles(signals.suggestedMiles * share))} mi${detail ? ` · ${detail}` : ''}`];
}
function workoutTemplates(profile, signals, trainingDays) {
  const minutes = Math.max(20, Math.min(Number(profile.sessionMinutes) || 45, 120));
  const surface = profile.trainingLocation === 'indoor' ? 'Treadmill' : profile.trainingLocation === 'outdoor' ? 'Outdoor' : 'Indoor or outdoor';
  const s = strengthSetup(profile, signals);
  const lower = template('Lower-body strength', 'Strength', 'Moderate', compactExercises([s.squat, s.hinge, ['Single-leg movement', `${s.sets} × 8 each side`], ['Calf raise', `${s.sets} × 12`], ['Plank or carry', '2–3 rounds']], minutes));
  const upper = template('Upper-body strength', 'Strength', 'Moderate', compactExercises([s.push, s.pull, ['Overhead press', `${s.sets} × 8–10`], ['Pulldown or assisted pull-up', `${s.sets} × 8–10`], ['Core anti-rotation', '2–3 rounds']], minutes));
  const full = template('Full-body strength', 'Strength', 'Moderate', compactExercises([s.squat, s.push, s.pull, s.hinge, ['Carry or plank', '2–3 rounds']], minutes));
  const recovery = template('Mobility + recovery', 'Recovery', 'Easy', [['Easy walk or bike', `${Math.min(minutes, 25)} min`], ['Hip and ankle mobility', '8 min'], ['Upper-back mobility', '5 min'], ['Easy breathing reset', '2 min']]);
  const easy = template('Easy aerobic run', 'Running', 'Easy', compactExercises([['Warm-up walk/jog', '8–10 min'], runBlock(`${surface} easy run`, Math.min(minutes - 18, 45), .30, signals, 'conversational effort'), ['Cool-down walk', '5–8 min'], ['Calf + hip mobility', '5 min']], minutes));
  const quality = template('Run intervals', 'Running', 'Moderate', compactExercises([['Warm-up jog + drills', '10 min'], runBlock('Controlled intervals', Math.min(minutes - 20, 30), .25, signals, profile.trainingLevel === 'new' ? '4 × 1 min steady / 2 min easy' : '4 × 2 min steady / 2 min easy'), ['Easy cool-down', '8–10 min'], ['Light strength circuit', '2 rounds']], minutes));
  const long = template('Long easy effort', 'Running', 'Easy', compactExercises([['Warm-up walk/jog', '8 min'], runBlock(`${surface} long easy run`, Math.min(minutes, 75), .45, signals, 'keep it easy'), ['Cool-down walk', '5 min'], ['Mobility reset', '8 min']], minutes));
  const support = template('Run support + strength', 'Running support', 'Easy', compactExercises([['Run drills', '8–10 min'], ['Split squat or step-up', `${s.sets} × 8 each side`], ['Row or band pull', `${s.sets} × 10`], ['Calf raise', `${s.sets} × 12`], ['Core work', '2 rounds']], minutes));
  if (profile.goal === 'build_strength') return [lower, upper, full, recovery];
  if (profile.goal === 'run_stronger') return [quality, easy, long, support];
  return [lower, easy, upper, long, full, support];
}
function plannedSession(day, date, plan, minutes) { return { id: `${date}-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day, date, dateLabel: day, title: plan.title, type: plan.type, minutes, intensity: plan.intensity, exercises: plan.exercises, status: 'upcoming', restDay: false }; }
function restSession(day, date, timezone) { return { id: `${date}-rest`, day, date, dateLabel: formatDate(dateParts(date), timezone), title: 'Rest day', type: 'Rest', intensity: 'Rest', minutes: 0, exercises: [], status: 'rest', restDay: true, alternatives: [] }; }
function dateParts(key) { const [year, month, day] = key.split('-').map(Number); return { year, month, day }; }
function alternativesFor() { return [
  { id: 'full-body', title: 'Full-body strength', type: 'Strength', intensity: 'Moderate', exercises: [['Squat or leg press', '3 × 8–10'], ['Push movement', '3 × 8–10'], ['Row movement', '3 × 8–12'], ['Hip hinge', '3 × 8–10'], ['Core work', '2 rounds']] },
  { id: 'upper-body', title: 'Upper body + core', type: 'Strength', intensity: 'Moderate', exercises: [['Push movement', '3 × 8–10'], ['Row movement', '3 × 8–12'], ['Overhead press', '3 × 8–10'], ['Pulldown', '3 × 8–10'], ['Core work', '2 rounds']] },
  { id: 'easy-run', title: 'Easy aerobic run', type: 'Running', intensity: 'Easy', exercises: [['Warm-up walk/jog', '8 min'], ['Easy run or walk-run', '30 min'], ['Cool-down walk', '5 min'], ['Mobility reset', '5 min']] },
  { id: 'mobility', title: 'Mobility + recovery', type: 'Recovery', intensity: 'Easy', exercises: [['Easy walk, bike, or mobility', '15 min'], ['Hip and ankle mobility', '8 min'], ['Upper-back mobility', '5 min'], ['Light stretching', '5 min']] }
]; }
function applyFeedbackAdjustment(sessions, workouts, todayKey, timezone) {
  const recent = workouts.filter(workout => { const date = workoutDate(workout, timezone); return date && date >= dateKey(addDays(dateParts(todayKey), -13)); });
  const latest = [...recent].sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))[0];
  const remaining = sessions.filter(session => !session.restDay && ['today', 'upcoming'].includes(session.status));
  const skippedRecently = recent.filter(workout => workout.outcome === 'skipped').length;
  const comfortable = recent.filter(workout => workout.outcome === 'completed' && Number(workout.perceivedEffort) > 0 && Number(workout.perceivedEffort) <= 5);
  if (!remaining.length) return null;
  if (latest && latest.outcome === 'completed' && Number(latest.perceivedEffort) >= 9) {
    const target = remaining.find(session => session.intensity !== 'Easy') || remaining[0];
    target.title = `Recovery-adjusted: ${target.title}`; target.type = 'Recovery'; target.intensity = 'Easy'; target.minutes = Math.min(target.minutes, 25); target.exercises = [['Easy walk, bike, or mobility', '15 min'], ['Hip and ankle mobility', '5 min'], ['Upper-back mobility', '5 min'], ['Light stretching', '5 min']]; target.adjusted = true;
    return { type: 'recovery', message: 'Your most recent logged effort was very hard, so the next demanding session is a recovery day.' };
  }
  if (skippedRecently >= 2) {
    remaining.forEach(session => { session.minutes = Math.max(20, Math.round(session.minutes * .75)); session.title = `Reduced: ${session.title}`; session.exercises = compactExercises(session.exercises, session.minutes); session.adjusted = true; });
    return { type: 'reduced', message: 'Recent skips suggest the workload may not fit real life, so remaining sessions are shorter this week.' };
  }
  if (comfortable.length >= 3 && comfortable.slice(0, 3).every(workout => Number(workout.perceivedEffort) <= 5)) {
    const target = remaining.find(session => session.intensity === 'Moderate') || remaining[0];
    target.exercises = [...target.exercises, ['Optional progression', 'Add 1 rep only if form stays strong']]; target.adjusted = true;
    return { type: 'progression', message: 'Several recent workouts were comfortable, so the next moderate session has one optional small progression.' };
  }
  return null;
}

function generatePlan(profile, options = {}) {
  const now = options.now || new Date(), timezone = profile.timezone || 'UTC', today = localParts(now, timezone), todayKey = dateKey(today), todayIndex = weekdayOrder.indexOf(today.weekday), weekStart = addDays(today, -todayIndex), weekStartKey = dateKey(weekStart), weekEndKey = dateKey(addDays(weekStart, 6));
  const selectedDays = [...new Set(profile.trainingDays || [])].filter(day => weekdayOrder.includes(day)).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
  const workouts = options.workouts || [], signals = buildTrainingSignals(profile, workouts, now, timezone), templates = workoutTemplates(profile, signals, selectedDays.length), minutes = Math.max(20, Math.min(Number(profile.sessionMinutes) || 45, 120));
  const plannedByDay = new Map(selectedDays.map((day, index) => { const parts = addDays(weekStart, weekdayOrder.indexOf(day)), date = dateKey(parts), session = plannedSession(day, date, templates[index % templates.length], minutes); session.dateLabel = formatDate(parts, timezone); return [day, session]; }));
  const sessions = weekdayOrder.map((day, index) => plannedByDay.get(day) || restSession(day, dateKey(addDays(weekStart, index)), timezone));
  const completedDates = new Set(workouts.filter(workout => workout.source === 'plan' && workout.outcome === 'completed').map(workout => workoutDate(workout, timezone)).filter(Boolean));
  sessions.forEach(session => { if (session.restDay) return; if (completedDates.has(session.date)) session.status = 'completed'; else if (session.date < todayKey) session.status = 'missed'; else if (session.date === todayKey) session.status = 'today'; });
  const feedbackAdjustment = applyFeedbackAdjustment(sessions, workouts, todayKey, timezone);
  const missedDate = options.missedToday?.at ? workoutDate({ loggedAt: options.missedToday.at }, timezone) : null;
  let adjustment = null;
  if (missedDate && missedDate >= weekStartKey && missedDate <= weekEndKey) {
    const missedIndex = sessions.findIndex(session => session.date === missedDate);
    if (missedIndex >= 0 && !sessions[missedIndex].restDay && sessions[missedIndex].status !== 'completed') {
      const missed = sessions[missedIndex]; missed.status = 'missed';
      const nextIndex = sessions.findIndex((session, index) => index > missedIndex && !session.restDay && session.date >= todayKey && session.status !== 'completed');
      if (nextIndex >= 0) {
        sessions[nextIndex] = { ...sessions[nextIndex], title: 'Recovery + movement reset', type: 'Recovery', intensity: 'Easy', minutes: 20, exercises: [['Walk, bike, or mobility', '15 min'], ['Hip and ankle mobility', '5 min'], ['Upper-back mobility', '5 min'], ['Light stretching', '5 min']], adjusted: true };
        const followingIndex = sessions.findIndex((session, index) => index > nextIndex && !session.restDay && session.date >= todayKey && session.status !== 'completed');
        if (followingIndex >= 0) sessions[followingIndex] = { ...sessions[followingIndex], title: `Rescheduled: ${missed.title}`, minutes: Math.min(missed.minutes, 45), exercises: compactExercises([...missed.exercises, ['Core or mobility', '2 rounds']], 45), adjusted: true };
        adjustment = 'A missed session becomes an easier re-entry day first; the valuable work returns on the following training day without stacking hard sessions.';
      }
    }
  }
  const overrides = new Map((options.overrides || []).map(override => [override.date, override]));
  sessions.forEach(session => { const override = overrides.get(session.date); if (override && !session.restDay) { session.title = override.title; session.type = override.type; session.intensity = override.intensity; session.exercises = override.exercises; session.customized = true; session.selectedAlternative = override.alternativeId; } });
  const tempoCheck = options.tempoCheck || null, checkedInSession = sessions.find(session => session.date === todayKey);
  if (tempoCheck && checkedInSession && !checkedInSession.restDay && ['today', 'upcoming'].includes(checkedInSession.status)) {
    const requestedMode = tempoCheck.trainingMode === 'running' || tempoCheck.trainingMode === 'lifting' ? tempoCheck.trainingMode : ['indoor', 'outdoor'].includes(tempoCheck.setup) ? 'running' : ['gym', 'no_gym'].includes(tempoCheck.setup) ? 'lifting' : null;
    if (requestedMode) {
      const todayProfile = { ...profile, goal: requestedMode === 'running' ? 'run_stronger' : 'build_strength', equipment: tempoCheck.setup === 'no_gym' ? 'bodyweight' : tempoCheck.setup === 'gym' ? 'full_gym' : profile.equipment, trainingLocation: tempoCheck.setup === 'indoor' ? 'indoor' : tempoCheck.setup === 'outdoor' ? 'outdoor' : profile.trainingLocation };
      const choices = workoutTemplates(todayProfile, signals, selectedDays.length);
      const replacement = requestedMode === 'running' ? choices.find(item => item.title === 'Easy aerobic run') || choices[0] : choices.find(item => item.title === 'Full-body strength') || choices[0];
      checkedInSession.title = `Today: ${replacement.title}`; checkedInSession.type = replacement.type; checkedInSession.intensity = replacement.intensity; checkedInSession.exercises = replacement.exercises; checkedInSession.todayAdjusted = true;
    }
    const availableMinutes = Number(tempoCheck.availableMinutes);
    if (availableMinutes === 12) { checkedInSession.title = `Minimum tempo: ${checkedInSession.title}`; checkedInSession.minutes = 12; checkedInSession.exercises = [['Move at your own pace', '8 min'], ['Easy mobility reset', '4 min']]; checkedInSession.intensity = 'Easy'; checkedInSession.tempoAdjusted = true; }
    else if ([20, 45, 90].includes(availableMinutes)) { const originalMinutes = checkedInSession.minutes; checkedInSession.minutes = availableMinutes; if (availableMinutes < originalMinutes) checkedInSession.exercises = compactExercises(checkedInSession.exercises, availableMinutes); else if (availableMinutes > originalMinutes) checkedInSession.exercises = [...checkedInSession.exercises, ['Optional easy finisher', `${availableMinutes - originalMinutes} min easy cardio, technique, or mobility`]]; checkedInSession.tempoAdjusted = true; }
    if (tempoCheck.energy === 'low') { checkedInSession.intensity = 'Easy'; checkedInSession.tempoAdjusted = true; }
  }
  sessions.forEach(session => { session.alternatives = session.restDay ? [] : alternativesFor(session); });
  const trainingMinutes = workouts.filter(workout => { const date = workoutDate(workout, timezone); return workout.outcome === 'completed' && date && date >= weekStartKey && date <= weekEndKey; }).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const todayMinutes = workouts.filter(workout => workout.outcome === 'completed' && workoutDate(workout, timezone) === todayKey).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const allAdjustments = [adjustment, feedbackAdjustment?.message].filter(Boolean);
  const dataRead = signals.currentMiles || signals.lifts.length ? `Tempo read ${signals.currentMiles ? `${signals.currentMiles} recent run miles` : ''}${signals.currentMiles && signals.lifts.length ? ' and ' : ''}${signals.lifts.length ? `${signals.lifts.reduce((total, lift) => total + lift.sets, 0)} logged lifting sets` : ''}.` : 'Log runs with mileage and lifting sets/weight to unlock data-based progression.';
  const runNote = signals.suggestedMiles ? `This week’s running target stays near ${signals.suggestedMiles} miles${signals.runProgression === 'small-increase' ? ', a small increase after consistent comfortable running.' : ', with no automatic mileage jump after a hard or inconsistent week.'}` : 'Tempo will use time-based runs until enough recent mileage is logged.';
  const title = profile.goal === 'build_strength' ? 'A stronger week, built from your logged work.' : profile.goal === 'both' ? 'Strength and running, built from your logged work.' : 'A running week built from your logged work.';
  return { title, timezone, weekStart: weekStartKey, weekEnd: weekEndKey, today: { date: todayKey, label: formatDate(today, timezone), session: sessions.find(session => session.date === todayKey) || null }, weekLabel: `${formatDate(weekStart, timezone)} – ${formatDate(addDays(weekStart, 6), timezone)}`, sessions, calendar: sessions.map(session => ({ day: session.day, date: session.date, dateLabel: session.dateLabel, status: session.status })), summary: { completed: sessions.filter(session => !session.restDay && session.status === 'completed').length, planned: sessions.filter(session => !session.restDay).length, trainingMinutes, todayMinutes }, adjustment: allAdjustments.length ? allAdjustments.join(' ') : null, feedbackAdjustment, dataSignals: signals, why: [dataRead, runNote, 'Strength sessions use several movements and multiple sets when time allows; load increases are suggestions only after repeated comfortable logged work.'] };
}

module.exports = { generatePlan, localParts, dateKey };
