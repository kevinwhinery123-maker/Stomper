const { isMedicalOrSensitive, safetyReply } = require('./coach-safety');

function previewReply(plan, message, actionSummary = '') {
  const today = plan.today.session;
  const adjustment = plan.adjustment ? ` ${plan.adjustment}` : '';
  if (actionSummary) return 'Done. Your Tempo record and plan have been updated. Check Plan to see the change reflected in your week.';
  if (/progress|improv|review|week|summary/i.test(message)) return `This week, you have completed ${plan.summary.completed} of ${plan.summary.planned} planned sessions. ${plan.adjustment || 'Keep logging what you actually do so Tempo can make the next recommendation more specific.'} Build the next win from consistency, not a big jump. Next focus: complete the next planned session at a controlled effort.`;
  if (/run|mile|pace|distance/i.test(message)) return today ? `For your running progress, protect easy effort before chasing faster pace. Your next planned session is ${today.title} for ${today.minutes} minutes. Finish feeling like you could have done a little more; that is what makes the next run productive. Next focus: log your distance and how it felt afterward.` : 'For running progress, build distance gradually and keep most runs at an effort where you could speak in short sentences. Next focus: log your next run with distance, time, and effort so Tempo can adjust from real work.';
  if (/lift|strength|weight|sets|reps/i.test(message)) return today ? `For strength progress, use controlled reps and leave a little in reserve instead of turning every set into a test. Today’s plan is ${today.title}. Next focus: log the exercise, sets, reps, and weight you actually use so Tempo can spot steady progress.` : 'For strength progress, repeat a few core movements consistently, then add a small amount of weight, reps, or control over time. Next focus: log one lift as "Log squat 3x8 at 95 lb." after your session.';
  if (/motivat|streak|consistent|skip|miss/i.test(message)) return 'A missed or imperfect day does not erase the work you have done. The useful move is to make the next session realistic enough to finish, then let that restart your rhythm. Next focus: choose the smallest version of your next workout you are confident you can complete.';
  if (/why|plan|today/i.test(message)) return today ? `Here is the coaching read: today is ${today.title}, ${today.minutes} minutes at ${today.intensity.toLowerCase()} effort. It supports your ${today.type.toLowerCase()} work without trying to make every day hard.${adjustment} The one thing to focus on is finishing at an effort you could repeat.` : `Today is a recovery or rest day. That is part of the plan, not lost progress. Your next planned session is shown in Plan.`;
  if (/move|schedule|tomorrow|time/i.test(message)) return `A coach would protect the rhythm before protecting a perfect calendar. Don’t stack missed work on top of tomorrow. Tell me “I can’t train today” to re-space the week, or say how many minutes you have and Tempo will make today fit.`;
  if (/hard|tired|effort|fatigue/i.test(message)) return `Good call paying attention to effort. The goal is productive work, not proving toughness every session. A very hard rating reduces the next demanding session; several comfortable sessions earn only a small progression. For today, choose the version you can finish with good form and enough energy to train again.`;
  return 'Smart AI Coach is not available yet for that kind of question. I can still handle clear Tempo updates such as changing training days, goals, session time, today’s workout, or logging a run or lift.';
}
function coachInstructions(context) {
  return `You are Tempo Coach, a sharp, supportive general fitness coach inside the Tempo app. Speak like a coach who has actually reviewed the athlete's Tempo record and wants steady, sustainable improvement—not like a generic chatbot. You may give practical general advice about workout planning, running, lifting, pacing, effort, recovery, motivation, habits, and fitting training around a schedule. Use the supplied Tempo record as the source of truth: never invent a workout, date, metric, or achievement. If the record does not tell you something, say so plainly.

Coach in this order whenever it fits: (1) acknowledge the athlete’s real situation or win, (2) connect it to their goal, recent work, or plan, (3) give a clear recommendation and the reason it helps, and (4) finish with one specific focus or next step. When they hit a problem such as missed time, low energy, a tough workout, or changing availability, solve the problem without guilt: preserve the most valuable training stimulus, remove the least valuable work, and avoid stacking hard days. Look for small earned progress—consistency, more controlled effort, better pacing, completed sets, or appropriate recovery—rather than automatically making every workout harder. Be encouraging but honest; point out when the data is too thin to call something progress.

This is general fitness guidance, not medical advice. You are not a doctor or injury specialist: do not diagnose, treat, clear, rehabilitate, or give medical advice. If the user asks about symptoms, injury, medication, pregnancy, eating disorders, or a medical condition, give this short boundary instead: “I can help with general fitness routines and planning, but I can’t assess symptoms, injuries, or medical conditions. Please pause or reduce training as appropriate and speak with a qualified healthcare professional for personalized guidance.”

Be direct and useful. Prefer a short paragraph plus a small “Next focus:” line over a long list. Ask one brief question only when it unlocks a better recommendation. Tempo may already have completed an action in the record; acknowledge it accurately. You can describe a possible plan or adjustment, but do not claim that you saved or changed anything unless actionCompleted says it happened. Keep replies under 180 words. Current Tempo record follows:\n${JSON.stringify(context)}`;
}
async function aiReply(context, message) {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5', store: false, instructions: coachInstructions(context), input: message }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The AI coach is temporarily unavailable.');
  const output = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('').trim();
  if (!output) throw new Error('The coach response could not be used safely.');
  return output;
}
async function createCoachReply({ user, plan, workouts, messages, message, actionSummary }) {
  if (isMedicalOrSensitive(message)) return { content: safetyReply(), mode: 'safety' };
  if (!process.env.OPENAI_API_KEY || !user.profile.aiConsent) return { content: previewReply(plan, message, actionSummary), mode: 'preview' };
  const context = {
    goal: user.profile.goal, trainingDays: user.profile.trainingDays, sessionMinutes: user.profile.sessionMinutes,
    level: user.profile.trainingLevel, equipment: user.profile.equipment, trainingLocation: user.profile.trainingLocation,
    currentWeek: plan.weekLabel, completedThisWeek: `${plan.summary.completed}/${plan.summary.planned}`,
    today: plan.today.session ? { date: plan.today.date, title: plan.today.session.title, type: plan.today.session.type, minutes: plan.today.session.minutes, intensity: plan.today.session.intensity, exercises: plan.today.session.exercises } : 'Rest or recovery day',
    upcomingSessions: plan.sessions.filter(session => session.status === 'upcoming').slice(0, 3).map(session => ({ date: session.date, title: session.title, type: session.type, minutes: session.minutes, intensity: session.intensity })),
    planAdjustment: plan.adjustment || 'None', actionCompleted: actionSummary || 'No Tempo record was changed for this message.',
    recentWorkouts: workouts.slice(0, 8).map(workout => ({ date: String(workout.loggedAt).slice(0, 10), title: workout.title, type: workout.type, outcome: workout.outcome, minutes: workout.durationMinutes, effort: workout.perceivedEffort, running: workout.details?.running || null, lifts: workout.details?.lifts || [] })),
    recentConversation: (messages || []).slice(-10).map(item => ({ role: item.role, content: item.content }))
  };
  try { return { content: await aiReply(context, message), mode: 'ai' }; } catch { return { content: previewReply(plan, message, actionSummary), mode: 'preview' }; }
}

function closestTempoCheckin(minutes) { return [12, 20, 45, 90].reduce((closest, option) => Math.abs(option - minutes) < Math.abs(closest - minutes) ? option : closest, 45); }
function weekdayList(text) { const labels = [['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'], ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']]; return labels.filter(([name]) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(text)).map(([, label]) => label); }
function sessionMinutes(minutes) { return Math.max(15, Math.min(120, Math.round(minutes / 5) * 5)); }
function interpretCoachAction(message, plan, profile = {}) {
  const text = String(message || '').toLowerCase().replace(/[’']/g, '');
  const days = weekdayList(text);
  if (days.length && /\b(change|set|update|move|my)\b.{0,40}\b(schedule|days|availability|available|train)\b|\b(i can train|my training days are)\b/.test(text)) return { type: 'training_days', trainingDays: days };
  if (/\b(change|set|update)\b.{0,30}\b(goal|training focus)\b|\bmy goal is\b/.test(text)) {
    const goal = /\b(hybrid|both|run and lift|running and lifting)\b/.test(text) ? 'both' : /\b(run|running)\b/.test(text) ? 'run_stronger' : /\b(lift|lifting|strength)\b/.test(text) ? 'build_strength' : null;
    if (goal) return { type: 'training_goal', goal };
  }
  const minutesMatch = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (minutesMatch && /\b(per session|each session|workouts? (?:need|should|to be)|(?:make|change|set) (?:my )?(?:workouts?|sessions?)(?: time)?|(?:make|change|set) (?:my )?(?:workout|session) time)\b/.test(text)) return { type: 'session_minutes', sessionMinutes: sessionMinutes(Number(minutesMatch[1])) };
  const liftMatch = text.match(/\b(?:log|record)\s+([a-z][a-z\s-]{1,55}?)\s+(?:(\d+)\s*x\s*(\d+)|(\d+)\s+sets?\s+(?:of\s+)?(\d+))(?:\s*(?:@|at)\s*([\d.]+\s*(?:lb|lbs|kg)?))?\b/);
  if (liftMatch) return { type: 'log_lift', exercise: liftMatch[1].trim(), sets: Number(liftMatch[2] || liftMatch[4]), reps: Number(liftMatch[3] || liftMatch[5]), weight: String(liftMatch[6] || '').trim() };
  const walkMinutes = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (walkMinutes && (/\b(?:log|record)\b.{0,35}\bwalk\b/.test(text) || /\bwalked\b/.test(text))) return { type: 'log_walk', minutes: Math.max(5, Math.min(240, Number(walkMinutes[1]))) };
  if (/\b(?:change|set|update|i have|i use)\b.{0,45}\b(equipment|bodyweight|home gym|full gym)\b/.test(text)) {
    const equipment = /\bbodyweight\b/.test(text) ? 'bodyweight' : /\bhome gym\b/.test(text) ? 'home_gym' : /\bfull gym|\bgym\b/.test(text) ? 'full_gym' : null;
    if (equipment) return { type: 'equipment', equipment };
  }
  if (/\b(?:change|set|update|prefer)\b.{0,45}\b(indoor|outdoor|location|treadmill)\b/.test(text)) {
    const trainingLocation = /\bboth\b/.test(text) ? 'both' : /\bindoor|treadmill\b/.test(text) ? 'indoor' : /\boutdoor\b/.test(text) ? 'outdoor' : null;
    if (trainingLocation) return { type: 'training_location', trainingLocation };
  }
  const today = plan.today?.session;
  if (!today) return null;
  if (/\b(mark|move|reschedule|skip)\b[^.]*\btoday\b|\b(i (?:cant|cannot|wont) train today|i need to skip today)\b/.test(text)) return { type: 'miss_today' };
  const requestedMode = /\b(run|running)\b/.test(text) ? 'running' : /\b(lift|lifting|strength)\b/.test(text) ? 'lifting' : null;
  const requestedSetup = /\bno gym|bodyweight\b/.test(text) ? 'no_gym' : /\bfull gym|\bgym\b/.test(text) ? 'gym' : /\bindoor|treadmill\b/.test(text) ? 'indoor' : /\boutdoor\b/.test(text) ? 'outdoor' : null;
  if ((requestedMode || requestedSetup) && /\b(today|todays|workout)\b/.test(text)) {
    const energy = /\b(low|tired|drained)\b/.test(text) ? 'low' : /\b(high|great|energized)\b/.test(text) ? 'high' : 'normal';
    return { type: 'tempo_check', availableMinutes: minutesMatch ? closestTempoCheckin(Number(minutesMatch[1])) : null, energy, trainingMode: requestedMode, setup: requestedSetup };
  }
  if (minutesMatch && /\b(today|available|have|only|time)\b/.test(text)) {
    const energy = /\b(low|tired|drained)\b/.test(text) ? 'low' : /\b(high|great|energized)\b/.test(text) ? 'high' : 'normal';
    return { type: 'tempo_check', availableMinutes: closestTempoCheckin(Number(minutesMatch[1])), energy };
  }
  if (/\b(change|switch|swap|make)\b/.test(text)) {
    const wanted = /\b(recovery|mobility|easy)\b/.test(text) ? 'recovery' : /\b(run|running)\b/.test(text) ? 'run' : /\b(lift|lifting|strength)\b/.test(text) ? 'strength' : /\b(bike|cycling)\b/.test(text) ? 'bike' : null;
    const alternative = wanted && (today.alternatives || []).find(item => `${item.type} ${item.title}`.toLowerCase().includes(wanted));
    if (alternative) return { type: 'workout_swap', alternative };
  }
  const milesMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/);
  const runMinutes = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (/\b(log|record)\b/.test(text) && /\b(run|ran|running)\b/.test(text) && milesMatch) {
    const effort = text.match(/\b(?:effort|rpe)\s*(10|[1-9])\b/);
    return { type: 'log_run', miles: Number(milesMatch[1]), minutes: runMinutes ? Number(runMinutes[1]) : Math.round(Number(milesMatch[1]) * 10), effort: effort ? Number(effort[1]) : null };
  }
  if (/\b(mark|log|record)\b.{0,25}\b(today|workout)\b.{0,25}\b(complete|completed|done|finished)\b|\b(i (?:completed|finished) todays? workout)\b/.test(text)) return { type: 'complete_today', session: today };
  return null;
}
module.exports = { createCoachReply, interpretCoachAction };
