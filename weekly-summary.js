function buildWeeklyCoachSummary(plan) {
  const fitness = plan.fitnessSummary || {}, week = fitness.windows?.current7 || {};
  const completed = Number(week.completedSessions || 0), partial = Number(week.partialSessions || 0), skipped = Number(week.skippedSessions || 0);
  const miles = Number(week.runningMiles || 0), sets = Number(week.liftingSets || 0), minutes = Number(week.trainingMinutes || 0);
  const observations = [];
  if (completed) observations.push(`You completed ${completed} ${completed === 1 ? 'session' : 'sessions'} and logged ${minutes} training minutes in the last 7 days.`);
  else observations.push('No completed sessions are recorded in the last 7 days yet. One realistic session is enough to restart the pattern.');
  if (miles) observations.push(`${miles} running ${miles === 1 ? 'mile is' : 'miles are'} recorded this week${fitness.trends?.runningMiles?.direction === 'higher' ? ', meaning your recent mileage is meaningfully above the prior week' : ''}.`);
  if (sets) observations.push(`${sets} lifting ${sets === 1 ? 'set is' : 'sets are'} recorded, giving Tempo a foundation for future strength comparisons.`);
  if (partial || skipped) observations.push(`${partial + skipped} ${partial + skipped === 1 ? 'session was' : 'sessions were'} partial or skipped. The next week should favor a schedule you can repeat over catching up.`);
  if (Number(week.highEffortSessions || 0)) observations.push('At least one high-effort session was recorded, so Tempo will avoid automatically increasing the next demanding workout.');
  const next = (plan.sessions || []).find(session => ['today', 'upcoming'].includes(session.status) && !session.restDay);
  const focus = next ? `Next focus: ${next.title} for ${next.minutes} minutes at ${String(next.intensity || 'controlled').toLowerCase()} effort.` : 'Next focus: recovery now, then begin the next planned week without trying to make up missed work.';
  return {
    version: 1, weekLabel: plan.weekLabel,
    headline: completed >= 3 ? 'A consistent week is taking shape.' : completed ? 'You have something real to build on.' : 'Start with the next repeatable win.',
    overview: observations[0], observations: observations.slice(1), nextFocus: focus,
    metrics: [{ label: 'sessions', value: completed }, { label: 'minutes', value: minutes }, { label: 'run miles', value: miles }, { label: 'lifting sets', value: sets }],
    dataQuality: fitness.dataQuality?.level || 'limited'
  };
}

module.exports = { buildWeeklyCoachSummary };
