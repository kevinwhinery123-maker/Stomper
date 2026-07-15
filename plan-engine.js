/**
 * Rules-based training plan generator.
 *
 * Keeping this logic separate makes it easy to read, test, and later replace
 * individual rules without touching authentication or the user interface.
 */
function session(day, title, type, minutes, intensity, exercises) {
  return { day, title, type, minutes, intensity, exercises, status: 'upcoming' };
}

function generatePlan(profile, missedToday = false) {
  const minutes = Math.max(30, Math.min(Number(profile.sessionMinutes) || 45, 75));
  const level = profile.trainingLevel;
  const strengthSets = level === 'new' ? '2 × 8' : level === 'advanced' ? '4 × 6' : '3 × 8';
  const strengthMove = profile.equipment === 'bodyweight' ? 'Split squat' : profile.equipment === 'home_gym' ? 'Goblet squat' : 'Back squat';
  const days = profile.trainingDays.length;
  const includesRun = profile.goal !== 'build_strength';
  const includesStrength = profile.goal !== 'run_stronger' || days >= 3;
  const sessions = [];
  if (includesStrength) sessions.push(session('Today', 'Lower body + intervals', 'Strength and running', minutes, 'Moderate', [[strengthMove, strengthSets], ['Romanian deadlift', level === 'new' ? '2 × 8' : '3 × 8'], ['Run intervals', level === 'new' ? '4 × 1 min' : '4 × 2 min']]));
  else sessions.push(session('Today', 'Run intervals', 'Running', minutes, 'Moderate', [['Warm-up jog', '10 min'], ['Run intervals', level === 'new' ? '4 × 1 min' : '4 × 2 min'], ['Easy cool-down', '10 min']]));
  if (includesRun) sessions.push(session('Thursday', 'Easy aerobic run', 'Running', Math.min(minutes, 40), 'Easy', [['Easy run', `${Math.min(minutes, 40)} min`], ['Mobility reset', '8 min']]));
  if (includesStrength && days >= 3) sessions.push(session('Saturday', 'Full-body strength', 'Strength', minutes, 'Moderate', [['Push movement', strengthSets], ['Hip hinge', strengthSets], ['Row movement', strengthSets]]));
  if (includesRun && days >= 4) sessions.push(session('Sunday', 'Long easy effort', 'Running', Math.min(minutes + 10, 75), 'Easy', [['Easy run or walk-run', `${Math.min(minutes + 10, 75)} min`], ['Optional mobility', '8 min']]));

  if (missedToday) {
    const missed = sessions.shift();
    missed.status = 'missed';
    missed.day = 'Missed today';
    sessions.unshift(missed, session('Tomorrow', 'Recovery + movement reset', 'Recovery', 20, 'Easy', [['Walk, bike, or mobility', '15 min'], ['Light stretching', '5 min']]));
    if (includesStrength) sessions.splice(2, 0, session('Friday', 'Rescheduled strength focus', 'Strength', Math.min(minutes, 45), 'Moderate', [[strengthMove, strengthSets], ['Hip hinge', '2 × 8'], ['Core carry or plank', '2 rounds']]));
    return {
      title: 'Your week has been adjusted—without cramming.',
      sessions,
      adjustment: 'Today’s missed session is not pushed onto tomorrow. Tomorrow becomes light recovery, then the most valuable strength work returns later in the week at a manageable dose.',
      why: ['Avoids stacking two demanding days together.', 'Keeps an easy movement day to maintain the habit.', 'Prioritizes the highest-value session later this week.']
    };
  }
  return {
    title: profile.goal === 'build_strength' ? 'A stronger week, built around you.' : profile.goal === 'both' ? 'Strength and running, in balance.' : 'A running week with strength behind it.',
    sessions,
    adjustment: null,
    why: ['Your selected goal determines the balance of running and strength.', `Your ${days}-day schedule spaces hard efforts apart.`, `The session volume is scaled for a ${level} starting point.`]
  };
}

module.exports = { generatePlan };
