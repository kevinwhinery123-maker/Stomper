const allowedUsageEvents = new Set([
  'account_created', 'signed_in', 'plan_viewed', 'workout_logged', 'workout_updated',
  'coach_message_sent', 'weekly_summary_viewed', 'strava_connected', 'strava_synced'
]);

function validUsageEvent(name) {
  const event = String(name || '').trim();
  return allowedUsageEvents.has(event) ? event : null;
}

module.exports = { allowedUsageEvents, validUsageEvent };
