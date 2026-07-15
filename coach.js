const { isMedicalOrSensitive, safetyReply } = require('./coach-safety');

function previewReply(plan, message) {
  const today = plan.today.session;
  const adjustment = plan.adjustment ? ` ${plan.adjustment}` : '';
  if (/why|plan|today/i.test(message)) return today ? `Today is ${today.title}: ${today.minutes} minutes at ${today.intensity.toLowerCase()} effort. The purpose is ${today.type.toLowerCase()}.${adjustment}` : `Today is a recovery or rest day. Your next planned session is shown in My plan.${adjustment}`;
  if (/move|schedule|tomorrow|time/i.test(message)) return 'Keep the weekly rhythm intact where possible. If you miss a planned day, use “I can’t train today” so Tempo can re-space the remaining work instead of stacking sessions.';
  if (/hard|tired|effort|fatigue/i.test(message)) return 'Use your effort rating honestly after each session. A very hard rating causes Tempo to reduce the next demanding session, while several comfortable sessions lead only to a small optional progression.';
  return `I’m tracking your ${plan.summary.completed}/${plan.summary.planned} completed sessions this week. Ask me about today’s plan, the reason for an adjustment, or how to fit training into your schedule.`;
}
function coachInstructions(context) {
  return `You are Tempo Coach, a supportive general fitness coach. You may discuss general workout planning, running, strength training, pacing, motivation, rest, and schedule changes. You are NOT a doctor, therapist, dietitian, physical therapist, or injury specialist. Never diagnose, treat, clear, rehabilitate, or give medical advice. Do not discuss symptoms, injuries, medications, pregnancy, eating disorders, or medical conditions; instead, give the exact short safety boundary: “I can help with general fitness routines and planning, but I can’t assess symptoms, injuries, or medical conditions. Please pause or reduce training as appropriate and speak with a qualified healthcare professional for personalized guidance.” Do not claim certainty, do not give dangerous intensity instructions, and do not make plan changes—explain the existing plan only. Keep replies under 120 words, warm, direct, and specific to this context:\n${JSON.stringify(context)}`;
}
async function aiReply(context, message) {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5', store: false, instructions: coachInstructions(context), input: message }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The AI coach is temporarily unavailable.');
  const output = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('').trim();
  if (!output || isMedicalOrSensitive(output)) throw new Error('The coach response could not be used safely.');
  return output;
}
async function createCoachReply({ user, plan, workouts, message }) {
  if (isMedicalOrSensitive(message)) return { content: safetyReply(), mode: 'safety' };
  if (!process.env.OPENAI_API_KEY || !user.profile.aiConsent) return { content: previewReply(plan, message), mode: 'preview' };
  const context = { goal: user.profile.goal, trainingDays: user.profile.trainingDays, level: user.profile.trainingLevel, equipment: user.profile.equipment, currentWeek: plan.weekLabel, today: plan.today.session ? { title: plan.today.session.title, type: plan.today.session.type, minutes: plan.today.session.minutes, intensity: plan.today.session.intensity } : 'Rest or recovery day', planAdjustment: plan.adjustment || 'None', recentWorkouts: workouts.slice(0, 5).map(workout => ({ type: workout.type, outcome: workout.outcome, minutes: workout.durationMinutes, effort: workout.perceivedEffort })) };
  try { return { content: await aiReply(context, message), mode: 'ai' }; } catch { return { content: previewReply(plan, message), mode: 'preview' }; }
}
module.exports = { createCoachReply };
