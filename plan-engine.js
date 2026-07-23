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
function recommendedSessionMinutes(workout, profile) {
  const levelBonus = profile.trainingLevel === 'advanced' ? 10 : profile.trainingLevel === 'intermediate' ? 5 : 0;
  const text = `${workout.type} ${workout.title}`.toLowerCase();
  if (/recovery|mobility/.test(text)) return 30;
  if (/long bike|brick/.test(text)) return Math.min(120, 75 + levelBonus);
  if (/long.*run|long easy effort/.test(text)) return Math.min(100, 60 + levelBonus);
  if (/cycling|bike/.test(text)) return Math.min(90, 55 + levelBonus);
  if (/swim/.test(text)) return Math.min(75, 45 + levelBonus);
  if (/interval|quality/.test(text)) return Math.min(70, 45 + levelBonus);
  if (/strength/.test(text)) return Math.min(75, 45 + levelBonus);
  if (/run/.test(text)) return Math.min(65, 40 + levelBonus);
  return 45 + levelBonus;
}

function buildTrainingSignals(profile, workouts, now, timezone) {
  const today = localParts(now, timezone), todayKey = dateKey(today);
  const recentStart = dateKey(addDays(today, -6)), previousStart = dateKey(addDays(today, -13)), previousEnd = dateKey(addDays(today, -7)), liftStart = dateKey(addDays(today, -27));
  const completed = workouts.filter(workout => workout.outcome === 'completed' && workoutDate(workout, timezone));
  let currentMiles = 0, previousMiles = 0, currentRunCount = 0, longestRecentRun = 0;
  const lifts = new Map();
  const recentEfforts = [];
  completed.forEach(workout => {
    const date = workoutDate(workout, timezone), running = workout.details?.running || {};
    const distance = Number(running.distance || 0);
    if (date >= liftStart && date <= todayKey && Number.isFinite(distance) && distance > 0) longestRecentRun = Math.max(longestRecentRun, distance);
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
  const declaredBaseline = profile.baseline || {};
  const declaredWeeklyMiles = Math.max(0, Number(declaredBaseline.weeklyRunMiles) || 0);
  const baselineMiles = currentMiles || previousMiles || declaredWeeklyMiles;
  let suggestedMiles = baselineMiles, runProgression = 'none';
  if (baselineMiles && currentRunCount >= 2 && !hardRecent) { suggestedMiles = roundMiles(baselineMiles * 1.10); runProgression = suggestedMiles > baselineMiles ? 'small-increase' : 'repeat'; }
  else if (baselineMiles) runProgression = hardRecent ? 'repeat-after-hard-week' : declaredWeeklyMiles && !currentMiles && !previousMiles ? 'declared-baseline' : 'repeat';
  return { recentStart, currentMiles, previousMiles, currentRunCount, longestRecentRun: roundMiles(longestRecentRun), suggestedMiles, runProgression, hardRecent, declaredBaseline, baselineSource: currentMiles || previousMiles ? 'logged' : declaredWeeklyMiles ? 'user' : 'none', lifts: [...lifts.values()] };
}

function findLift(signals, aliases) { return signals.lifts.find(record => aliases.some(alias => record.name.toLowerCase().includes(alias))); }
function liftIncrement(name, weight, trainingLevel) {
  const lowerBody = /squat|deadlift|leg press|hip thrust|lunge|split squat/i.test(name);
  const rate = trainingLevel === 'new' ? .03 : trainingLevel === 'advanced' ? .01 : .015;
  const roundingStep = trainingLevel === 'advanced' ? 1 : 2.5;
  const percentageIncrement = Math.max(roundingStep, Math.round((weight * rate) / roundingStep) * roundingStep);
  return Math.min(lowerBody ? 10 : 5, percentageIncrement);
}
function loadPrescription(profile, signals, aliases, fallbackName, sets, reps) {
  const record = findLift(signals, aliases);
  const latest = record?.entries[0], previous = record?.entries[1];
  if (!latest?.weight) return [record?.name || fallbackName, `${sets} × ${reps}`];
  const latestWeight = numericWeight(latest.weight), previousWeight = numericWeight(previous?.weight);
  const repTop = Math.max(...String(reps).match(/\d+/g).map(Number));
  const repeatedTopRange = previous && latest.reps >= repTop && previous.reps >= repTop && latestWeight !== null && previousWeight !== null && Math.abs(latestWeight - previousWeight) < .01;
  const effortSupportsProgress = latest.effort !== null && previous?.effort != null && latest.effort <= 7 && previous.effort <= 7;
  const readyToProgress = repeatedTopRange && effortSupportsProgress && !signals.hardRecent;
  if (readyToProgress) { const increment = liftIncrement(record.name, latestWeight, profile.trainingLevel); return [record.name, `${sets} × ${reps} @ ${formatWeight(latestWeight + increment)} · optional +${increment} lb after two strong sessions`]; }
  return [record.name, `${sets} × ${reps} @ ${formatWeight(latest.weight)} · repeat last load`];
}
function strengthSetup(profile, signals) {
  const declaredSets = Math.max(0, Number(signals.declaredBaseline?.weeklyLiftSets) || 0);
  const sets = declaredSets ? declaredSets < 12 ? 2 : declaredSets < 32 ? 3 : 4 : profile.trainingLevel === 'new' ? 2 : profile.trainingLevel === 'advanced' ? 4 : 3;
  const squatName = profile.equipment === 'bodyweight' ? 'Split squat' : profile.equipment === 'home_gym' ? 'Goblet squat' : 'Back squat';
  return { sets, reps: profile.trainingLevel === 'advanced' ? '6–8' : '8–10', squat: loadPrescription(profile, signals, ['squat', 'leg press'], squatName, sets, profile.trainingLevel === 'advanced' ? '6–8' : '8–10'), hinge: loadPrescription(profile, signals, ['deadlift', 'hip thrust', 'hinge'], 'Romanian deadlift', sets, '8–10'), push: loadPrescription(profile, signals, ['bench', 'push-up', 'press'], 'Bench press or push-up', sets, '8–10'), pull: loadPrescription(profile, signals, ['row', 'pull-down', 'pulldown'], 'Row movement', sets, '8–12') };
}
function runBlock(label, minutes, share, signals, detail) {
  if (!signals.suggestedMiles) return [label, `${minutes} min${detail ? ` · ${detail}` : ''}`];
  let distance = Math.max(0.5, roundMiles(signals.suggestedMiles * share));
  const longest = Math.max(0, Number(signals.longestRecentRun) || Number(signals.declaredBaseline?.longestRunMiles) || 0);
  if (longest && /long/i.test(label)) distance = Math.min(distance, Math.max(0.5, roundMiles(longest * 1.10)));
  return [label, `${distance} mi${detail ? ` · ${detail}` : ''}`];
}
function milestonePhase(profile, todayKey) {
  const milestone = profile.baseline?.milestone || {};
  if (!milestone.targetDate || milestone.kind === 'none') return null;
  const daysToGoal = Math.ceil((new Date(`${milestone.targetDate}T12:00:00Z`) - new Date(`${todayKey}T12:00:00Z`)) / 86400000);
  const weeksToGoal = Math.max(0, Math.ceil(daysToGoal / 7));
  if (daysToGoal < 0) return { key: 'review', label: 'Goal review', weeksToGoal: 0, ...milestone };
  if (weeksToGoal <= 2) return { key: 'taper', label: /lift/.test(milestone.kind) ? 'Test preparation' : 'Taper', weeksToGoal, ...milestone };
  if (weeksToGoal <= 8) return { key: 'specific', label: 'Goal-specific build', weeksToGoal, ...milestone };
  if (weeksToGoal <= 20) return { key: 'build', label: 'Build', weeksToGoal, ...milestone };
  return { key: 'foundation', label: 'Foundation', weeksToGoal, ...milestone };
}
function triathlonPhase(profile, todayKey) {
  const raceDate = profile.baseline?.triathlon?.raceDate;
  if (!raceDate) return { key: 'foundation', label: 'Foundation', weeksToRace: null };
  const daysToRace = Math.ceil((new Date(`${raceDate}T12:00:00Z`) - new Date(`${todayKey}T12:00:00Z`)) / 86400000);
  const weeksToRace = Math.max(0, Math.ceil(daysToRace / 7));
  if (daysToRace < 0) return { key: 'recovery', label: 'Post-race recovery', weeksToRace: 0 };
  if (weeksToRace <= 2) return { key: 'taper', label: 'Taper', weeksToRace };
  if (weeksToRace <= 5) return { key: 'peak', label: 'Race-specific peak', weeksToRace };
  if (weeksToRace <= 12) return { key: 'build', label: 'Build', weeksToRace };
  if (weeksToRace <= 24) return { key: 'base', label: 'Base', weeksToRace };
  return { key: 'foundation', label: 'Foundation', weeksToRace };
}
function triathlonTemplates(profile, signals, trainingDays) {
  const minutes = Math.max(20, Math.min(Number(profile.sessionMinutes) || 45, 360));
  const baseline = profile.baseline || {}, race = baseline.triathlon || {}, distance = race.distance || '70.3';
  const phase = profile.triathlonPhase || { key: 'foundation', label: 'Foundation' };
  const multiplier = { foundation: .75, base: .9, build: 1, peak: 1.05, taper: .6, recovery: .4 }[phase.key] || .75;
  const defaultSwim = { sprint: 1800, olympic: 2500, '70.3': 3500, '140.6': 5000 }[distance];
  const defaultBike = { sprint: 25, olympic: 40, '70.3': 70, '140.6': 100 }[distance];
  const weeklySwim = Math.max(800, Number(baseline.weeklySwimYards) || defaultSwim) * multiplier;
  const weeklyBike = Math.max(10, Number(baseline.weeklyBikeMiles) || defaultBike) * multiplier;
  const weeklyRun = Math.max(3, Number(signals.suggestedMiles) || Number(baseline.weeklyRunMiles) || ({ sprint: 6, olympic: 10, '70.3': 15, '140.6': 20 }[distance])) * multiplier;
  const swimDistance = Math.round(weeklySwim / 2 / 50) * 50;
  const bikeDistance = Math.round(weeklyBike * .3 * 2) / 2;
  const longBikeDistance = Math.round(weeklyBike * .55 * 2) / 2;
  const easyRunDistance = Math.round(weeklyRun * .35 * 4) / 4;
  const longRunCap = Number(baseline.longestRunMiles) ? Number(baseline.longestRunMiles) * 1.1 : weeklyRun * .5;
  const longRunDistance = Math.max(1, Math.round(Math.min(weeklyRun * .5, longRunCap) * 4) / 4);
  const swimTechnique = template('Swim technique + aerobic form', 'Swimming', 'Easy', [['Easy warm-up', `${Math.round(swimDistance * .2)} yd`], ['Technique drills', `${Math.round(swimDistance * .3)} yd`], ['Steady aerobic swimming', `${Math.round(swimDistance * .4)} yd`], ['Easy cool-down', `${Math.round(swimDistance * .1)} yd`]]);
  const swimEndurance = template('Swim endurance', 'Swimming', 'Moderate', [['Warm-up + drills', `${Math.round(swimDistance * .25)} yd`], ['Controlled endurance intervals', `${Math.round(swimDistance * .65)} yd`], ['Cool-down', `${Math.round(swimDistance * .1)} yd`], ['Focus', 'Even pacing and relaxed breathing']]);
  const bikeQuality = template('Bike cadence + controlled tempo', 'Cycling', 'Moderate', [['Easy spin', '10 min'], ['Cadence drills', '6 x 2 min smooth / 2 min easy'], ['Steady riding', `${Math.max(15, minutes - 30)} min`], ['Cool-down', '8 min']]);
  const bikeAerobic = template('Aerobic bike', 'Cycling', 'Easy', [['Easy warm-up', '10 min'], ['Conversational ride', `${bikeDistance} mi`], ['Cadence focus', 'Smooth and controlled'], ['Cool-down', '5 min']]);
  const easyRun = template('Easy durability run', 'Running', 'Easy', [['Warm-up walk/jog', '8 min'], ['Easy run', `${easyRunDistance} mi · conversational effort`], ['Cool-down walk', '5 min'], ['Calf + hip mobility', '5 min']]);
  const longRun = template('Long easy run', 'Running', 'Easy', [['Warm-up walk/jog', '8 min'], ['Long easy run', `${longRunDistance} mi · run/walk is welcome`], ['Fuel + hydration note', 'Practice the plan for longer sessions'], ['Cool-down', '5–10 min']]);
  const longBikeBrick = template('Long bike + short brick', 'Brick', 'Easy', [['Long aerobic bike', `${longBikeDistance} mi`], ['Transition', 'Practice a calm, organized change'], ['Short easy run', `${Math.max(.5, Math.round(weeklyRun * .1 * 4) / 4)} mi`], ['Fueling practice', 'Use the same products and timing planned for race day']]);
  const recoveryStrength = template('Recovery + strength maintenance', 'Strength', 'Easy', [['Mobility reset', '10 min'], ['Single-leg strength', '2 x 8 each side'], ['Row or pull movement', '2 x 10'], ['Core stability', '2 rounds']]);
  if (trainingDays <= 3) return [swimTechnique, longBikeBrick, longRun];
  if (trainingDays === 4) return [swimTechnique, bikeAerobic, longBikeBrick, longRun];
  if (trainingDays === 5) return [swimTechnique, bikeQuality, easyRun, longBikeBrick, longRun];
  if (trainingDays === 6) return [swimTechnique, bikeQuality, easyRun, swimEndurance, longBikeBrick, longRun];
  return [recoveryStrength, swimTechnique, bikeQuality, easyRun, swimEndurance, longBikeBrick, longRun];
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
  if (profile.goal === 'triathlon') return triathlonTemplates(profile, signals, trainingDays);
  if (profile.goal === 'build_strength') return [lower, upper, full, recovery];
  if (profile.goal === 'run_stronger') return [quality, easy, long, support];
  if (profile.goal === 'lose_weight') return [full, easy, upper, long, lower, recovery];
  if (profile.goal === 'general_fitness') return [full, easy, upper, recovery, long];
  return [lower, easy, upper, long, full, support];
}
function buildPrescription(profile, sessions, signals) {
  const planned = sessions.filter(session => !session.restDay);
  const strengthDays = planned.filter(session => /strength/i.test(session.type)).length;
  const aerobicDays = planned.filter(session => /running|aerobic/i.test(session.type)).length;
  const hardDays = planned.filter(session => !['Easy', 'Rest'].includes(session.intensity)).length;
  const swimDays = planned.filter(session => /swim/i.test(session.type)).length;
  const bikeDays = planned.filter(session => /cycl|brick/i.test(session.type)).length;
  const runDays = planned.filter(session => /run|brick/i.test(session.type)).length;
  const scheduledMinutes = planned.reduce((total, session) => total + session.minutes, 0);
  const milestone = profile.milestonePhase;
  const milestoneWeeks = milestone ? { value: `${milestone.weeksToGoal} wk`, label: 'until goal day' } : null;
  const runGoal = milestone?.targetDistanceMiles ? `${milestone.targetDistanceMiles} mile goal` : null;
  const liftGoal = milestone?.liftName ? `${milestone.liftName}${milestone.targetWeight ? ` · ${milestone.targetWeight} lb` : ''}` : null;
  const shared = { scheduledMinutes, strengthDays, aerobicDays, hardDays };
  const prescriptions = {
    triathlon: { label: 'Triathlon training', headline: `${profile.triathlonPhase?.label || 'Foundation'} · ${profile.baseline?.triathlon?.distance || '70.3'}`, metrics: [{ value: profile.triathlonPhase?.weeksToRace === null ? 'Set date' : `${profile.triathlonPhase?.weeksToRace} wk`, label: 'until race' }, { value: String(swimDays), label: 'swim sessions' }, { value: String(bikeDays), label: 'bike / brick sessions' }, { value: String(runDays), label: 'run / brick sessions' }], guidance: 'Tempo balances swim, bike, run, brick practice, strength maintenance, and recovery. Weekly completion and effort matter more than chasing every distance.', ...shared },
    run_stronger: { label: 'Improve running', headline: runGoal || (signals.suggestedMiles ? `${signals.suggestedMiles} mile running target` : 'Build a repeatable running base'), metrics: [milestoneWeeks || { value: signals.suggestedMiles ? `${signals.suggestedMiles} mi` : `${aerobicDays} runs`, label: 'weekly target' }, { value: 'mostly', label: 'easy running' }, { value: String(Math.min(hardDays, 1)), label: 'quality session' }, { value: String(strengthDays), label: 'support session' }], guidance: `${milestone ? `${milestone.label} toward the dated goal. ` : ''}Most running stays conversational. Tempo treats 10% as a conservative weekly ceiling, caps long-run spikes, and holds progression after hard or inconsistent weeks.`, ...shared },
    build_strength: { label: 'Build muscle + strength', headline: liftGoal || `${strengthDays} focused lifting days`, metrics: [milestoneWeeks || { value: String(strengthDays), label: 'lifting days' }, { value: '~10', label: 'sets per muscle goal' }, { value: '2–4', label: 'sets per exercise' }, { value: '1–3', label: 'reps in reserve' }], guidance: `${milestone ? `${milestone.label} toward the dated goal. ` : ''}Tempo uses repeatable movement patterns and double progression: reach the top of a rep range with good form, then add a small amount of load.`, ...shared },
    lose_weight: { label: 'Sustainable weight management', headline: `${scheduledMinutes} planned activity minutes`, metrics: [{ value: String(scheduledMinutes), label: 'planned minutes' }, { value: String(strengthDays), label: 'strength days' }, { value: String(aerobicDays), label: 'aerobic days' }, { value: 'steady', label: 'progression pace' }], guidance: 'The plan combines resistance and aerobic work to support fat loss while protecting muscle. Tempo does not prescribe crash diets or punishment workouts.', ...shared },
    general_fitness: { label: 'Healthy fitness', headline: 'Strength, cardio, and recovery in balance', metrics: [{ value: String(scheduledMinutes), label: 'planned minutes' }, { value: String(strengthDays), label: 'strength days' }, { value: String(aerobicDays), label: 'aerobic days' }, { value: String(7 - planned.length), label: 'open/recovery days' }], guidance: 'Tempo builds toward 150–300 aerobic minutes plus at least two strength days, starting from what fits your current week.', ...shared },
    both: { label: 'Hybrid performance', headline: runGoal || liftGoal || 'Running and lifting without stacking hard days', metrics: [milestoneWeeks || { value: String(aerobicDays), label: 'running days' }, { value: String(strengthDays), label: 'lifting days' }, { value: String(hardDays), label: 'demanding days' }, { value: String(scheduledMinutes), label: 'planned minutes' }], guidance: `${milestone ? `${milestone.label} toward the dated goal. ` : ''}Tempo balances running and lifting, separates demanding sessions when possible, and protects consistency before adding volume.`, ...shared }
  };
  return prescriptions[profile.goal] || prescriptions.both;
}

function plannedSession(day, date, plan, minutes, equipment) { return { id: `${date}-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, day, date, dateLabel: day, title: plan.title, type: plan.type, minutes, equipment, intensity: plan.intensity, exercises: plan.exercises, status: 'upcoming', restDay: false }; }
function restSession(day, date, timezone) { return { id: `${date}-rest`, day, date, dateLabel: formatDate(dateParts(date), timezone), title: 'Rest day', type: 'Rest', intensity: 'Rest', minutes: 0, exercises: [], status: 'rest', restDay: true, alternatives: [] }; }
function dateParts(key) { const [year, month, day] = key.split('-').map(Number); return { year, month, day }; }
function alternativesFor(session, includeTriathlon = false) { return [
  ...(includeTriathlon ? [
    { id: 'swim-technique', title: 'Swim technique', type: 'Swimming', intensity: 'Easy', exercises: [['Easy warm-up', '300 yd'], ['Technique drills', '6 x 50 yd'], ['Steady aerobic swimming', '600 yd'], ['Cool-down', '200 yd']] },
    { id: 'aerobic-bike', title: 'Aerobic bike', type: 'Cycling', intensity: 'Easy', exercises: [['Easy spin', '10 min'], ['Conversational riding', '30 min'], ['Cadence focus', 'Smooth and controlled'], ['Cool-down', '5 min']] },
    { id: 'short-brick', title: 'Short bike + run brick', type: 'Brick', intensity: 'Easy', exercises: [['Easy bike', '30 min'], ['Transition', '5 min or less'], ['Easy run', '10 min'], ['Cool-down walk', '5 min']] }
  ] : []),
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
  const savedSchedule = profile.baseline?.weekSchedule || {};
  const scheduledDays = weekdayOrder.filter(day => savedSchedule[day]?.enabled);
  const selectedDays = (scheduledDays.length ? scheduledDays : [...new Set(profile.trainingDays || [])]).filter(day => weekdayOrder.includes(day)).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
  const phase = profile.goal === 'triathlon' ? triathlonPhase(profile, todayKey) : milestonePhase(profile, todayKey);
  const planningProfile = phase ? { ...profile, triathlonPhase: profile.goal === 'triathlon' ? phase : null, milestonePhase: profile.goal === 'triathlon' ? null : phase } : profile;
  const workouts = options.workouts || [], signals = buildTrainingSignals(planningProfile, workouts, now, timezone), templates = workoutTemplates(planningProfile, signals, selectedDays.length), defaultMinutes = Math.max(20, Math.min(Number(profile.sessionMinutes) || 45, 360));
  const plannedByDay = new Map(selectedDays.map((day, index) => {
    const daySettings = savedSchedule[day] || {}, equipment = daySettings.equipment || profile.equipment || 'bodyweight';
    const initialTemplate = templates[index % templates.length];
    const automaticMinutes = recommendedSessionMinutes(initialTemplate, planningProfile);
    const fixedDuration = daySettings.durationMode === 'fixed' || (daySettings.durationMode === undefined && Number(daySettings.minutes) > 0 && Number(daySettings.minutes) !== 45);
    const minutes = fixedDuration ? Math.max(15, Math.min(Number(daySettings.minutes) || defaultMinutes, 360)) : automaticMinutes;
    const dayProfile = { ...planningProfile, sessionMinutes: minutes, equipment };
    const dayTemplates = workoutTemplates(dayProfile, signals, selectedDays.length);
    const parts = addDays(weekStart, weekdayOrder.indexOf(day)), date = dateKey(parts), session = plannedSession(day, date, dayTemplates[index % dayTemplates.length] || templates[index % templates.length], minutes, equipment);
    session.durationSource = fixedDuration ? 'fixed' : 'tempo';
    session.dateLabel = formatDate(parts, timezone); return [day, session];
  }));
  const sessions = weekdayOrder.map((day, index) => plannedByDay.get(day) || restSession(day, dateKey(addDays(weekStart, index)), timezone));
  const completedDates = new Set(workouts.filter(workout => workout.source === 'plan' && workout.outcome === 'completed').map(workout => workoutDate(workout, timezone)).filter(Boolean));
  const planStartedAt = profile.baseline?.planStartedAt || weekStartKey;
  sessions.forEach(session => {
    if (session.restDay) return;
    if (completedDates.has(session.date)) session.status = 'completed';
    else if (session.date < planStartedAt) session.status = 'before-start';
    else if (session.date < todayKey) session.status = 'missed';
    else if (session.date === todayKey) session.status = 'today';
  });
  const feedbackAdjustment = applyFeedbackAdjustment(sessions, workouts, todayKey, timezone);
  const inferredMissedDate = profile.baseline?.planStartedAt ? [...sessions].reverse().find(session => session.status === 'missed')?.date || null : null;
  const missedDate = options.missedToday?.at ? workoutDate({ loggedAt: options.missedToday.at }, timezone) : inferredMissedDate;
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
  sessions.forEach(session => { session.alternatives = session.restDay ? [] : alternativesFor(session, profile.goal === 'triathlon'); });
  const trainingMinutes = workouts.filter(workout => { const date = workoutDate(workout, timezone); return workout.outcome === 'completed' && date && date >= weekStartKey && date <= weekEndKey; }).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const todayMinutes = workouts.filter(workout => workout.outcome === 'completed' && workoutDate(workout, timezone) === todayKey).reduce((total, workout) => total + Number(workout.durationMinutes || 0), 0);
  const allAdjustments = [adjustment, feedbackAdjustment?.message].filter(Boolean);
  const hasDeclaredBaseline = Object.values(signals.declaredBaseline || {}).some(value => Number(value) > 0);
  const dataRead = signals.currentMiles || signals.lifts.length ? `Tempo read ${signals.currentMiles ? `${signals.currentMiles} recent run miles` : ''}${signals.currentMiles && signals.lifts.length ? ' and ' : ''}${signals.lifts.length ? `${signals.lifts.reduce((total, lift) => total + lift.sets, 0)} logged lifting sets` : ''}. Logged work takes priority over your saved starting baseline.` : hasDeclaredBaseline ? 'Tempo is using your saved starting baseline until enough completed workouts are logged.' : 'Add a starting baseline or log runs with mileage and lifting sets/weight to unlock data-based progression.';
  const runNote = signals.suggestedMiles ? `This week’s running target stays near ${signals.suggestedMiles} miles${signals.runProgression === 'small-increase' ? ', using 10% as a conservative ceiling after consistent comfortable running—not a promise of injury prevention.' : ', with no automatic mileage jump after a hard or inconsistent week.'}` : 'Tempo will use time-based runs until enough recent mileage is logged.';
  const titles = { triathlon: `Train for your ${profile.baseline?.triathlon?.distance || 'triathlon'} with a phased, realistic week.`, build_strength: 'Build muscle and strength with repeatable progress.', both: 'Build strength and endurance in the same week.', run_stronger: 'Build running mileage without rushing the process.', lose_weight: 'Build a sustainable week for weight management.', general_fitness: 'Build fitness you can maintain.' };
  const prescription = buildPrescription(planningProfile, sessions, signals);
  const triathlonNote = profile.goal === 'triathlon' ? `${phase.label}${phase.weeksToRace === null ? ' until you add a race date.' : ` with ${phase.weeksToRace} weeks until race day.`} The plan prioritizes consistent swim, bike, and run practice without making a finish-time promise.` : null;
  const milestoneNote = profile.goal !== 'triathlon' && phase ? `${phase.label} with ${phase.weeksToGoal} weeks until the dated goal. Tempo will keep adjusting from completed work rather than promising a performance result.` : null;
  return { title: titles[profile.goal] || titles.both, prescription, phase, milestone: profile.goal === 'triathlon' ? null : phase, baseline: profile.baseline || {}, timezone, weekStart: weekStartKey, weekEnd: weekEndKey, today: { date: todayKey, label: formatDate(today, timezone), session: sessions.find(session => session.date === todayKey) || null }, weekLabel: `${formatDate(weekStart, timezone)} – ${formatDate(addDays(weekStart, 6), timezone)}`, sessions, calendar: sessions.map(session => ({ day: session.day, date: session.date, dateLabel: session.dateLabel, status: session.status })), summary: { completed: sessions.filter(session => !session.restDay && session.status === 'completed').length, planned: sessions.filter(session => !session.restDay && session.status !== 'before-start').length, trainingMinutes, todayMinutes }, adjustment: allAdjustments.length ? allAdjustments.join(' ') : null, feedbackAdjustment, dataSignals: signals, why: [prescription.guidance, triathlonNote || milestoneNote || dataRead, profile.goal === 'run_stronger' || profile.goal === 'both' ? runNote : 'Tempo increases work only after repeated comfortable sessions and keeps recovery visible in the plan.'] };
}

module.exports = { generatePlan, localParts, dateKey };
