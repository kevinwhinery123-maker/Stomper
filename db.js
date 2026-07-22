// Database layer: all Neon/PostgreSQL access lives here, separate from HTTP routes.
require('dotenv').config();
const { Pool } = require('pg');

const hasLocalConfig = process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER;
if (!process.env.DATABASE_URL && !hasLocalConfig) {
  throw new Error('Database configuration is missing. Add DATABASE_URL or local PG settings to the .env file.');
}
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool();

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role,
    createdAt: row.created_at, missedToday: row.missed_today_at ? { at: row.missed_today_at } : null,
    profile: row.goal ? { goal: row.goal, trainingDays: row.training_days, sessionMinutes: row.session_minutes, trainingLevel: row.training_level, equipment: row.equipment, trainingLocation: row.training_location, timezone: row.timezone, baseline: row.baseline || {}, constraints: row.constraints, healthConsent: row.health_consent, aiConsent: row.ai_consent, updatedAt: row.updated_at } : null
  };
}
const userSelect = `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.missed_today_at,
  p.goal, p.training_days, p.session_minutes, p.training_level, p.equipment, p.training_location, p.timezone, p.baseline, p.constraints, p.health_consent, p.ai_consent, p.updated_at
  FROM users u LEFT JOIN profiles p ON p.user_id = u.id`;

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'consumer', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), missed_today_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      goal TEXT NOT NULL, training_days TEXT[] NOT NULL, session_minutes INTEGER NOT NULL,
      training_level TEXT NOT NULL, equipment TEXT NOT NULL, training_location TEXT NOT NULL DEFAULT 'both', timezone TEXT NOT NULL, baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
      constraints TEXT NOT NULL DEFAULT '', health_consent BOOLEAN NOT NULL DEFAULT false, ai_consent BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_consent BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS training_location TEXT NOT NULL DEFAULT 'both';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS baseline JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS workouts (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, type TEXT NOT NULL, outcome TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      perceived_effort INTEGER, note TEXT NOT NULL DEFAULT '', details JSONB NOT NULL DEFAULT '{}'::jsonb, source TEXT NOT NULL DEFAULT 'manual', logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS workouts_user_logged_at_idx ON workouts(user_id, logged_at DESC);
    CREATE TABLE IF NOT EXISTS coach_messages (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS coach_conversations (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New conversation', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE coach_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES coach_conversations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS coach_messages_user_created_at_idx ON coach_messages(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS coach_conversations_user_updated_at_idx ON coach_conversations(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS strava_connections (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, athlete_id BIGINT NOT NULL,
      access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at BIGINT NOT NULL, scope TEXT NOT NULL DEFAULT '', connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS strava_activities (
      strava_id BIGINT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL, name TEXT NOT NULL, sport_type TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL, duration_seconds INTEGER NOT NULL, distance_meters REAL, elevation_gain REAL,
      average_heartrate REAL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS strava_activities_user_started_at_idx ON strava_activities(user_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS plan_overrides (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_date DATE NOT NULL,
      alternative_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, intensity TEXT NOT NULL,
      exercises JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, session_date)
    );
    CREATE TABLE IF NOT EXISTS friendships (
      id UUID PRIMARY KEY, requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (requester_id, recipient_id)
    );
    CREATE INDEX IF NOT EXISTS friendships_recipient_status_idx ON friendships(recipient_id, status);
    CREATE TABLE IF NOT EXISTS daily_checkins (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, checkin_date DATE NOT NULL,
      available_minutes INTEGER NOT NULL, energy TEXT NOT NULL, training_mode TEXT NOT NULL DEFAULT 'auto', setup TEXT NOT NULL DEFAULT 'auto', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, checkin_date)
    );
    ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS training_mode TEXT NOT NULL DEFAULT 'auto';
    ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS setup TEXT NOT NULL DEFAULT 'auto';
    CREATE TABLE IF NOT EXISTS daily_resets (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, reset_date DATE NOT NULL,
      action TEXT NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, reset_date)
    );
    CREATE TABLE IF NOT EXISTS tester_feedback (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tester_feedback_created_at_idx ON tester_feedback(created_at DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS app_errors (
      id UUID PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL, message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS app_errors_created_at_idx ON app_errors(created_at DESC);
    CREATE TABLE IF NOT EXISTS usage_events (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_name TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS usage_events_name_time_idx ON usage_events(event_name, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS usage_events_user_time_idx ON usage_events(user_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS training_wheel_snapshots (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start DATE NOT NULL, week_end DATE NOT NULL, snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, week_start)
    );
    CREATE INDEX IF NOT EXISTS training_wheel_snapshots_user_week_idx ON training_wheel_snapshots(user_id, week_start DESC);
  `);
}
async function getUserById(id) { return toUser((await pool.query(`${userSelect} WHERE u.id = $1`, [id])).rows[0]); }
async function getUserByEmail(email) { return toUser((await pool.query(`${userSelect} WHERE u.email = $1`, [email])).rows[0]); }
async function createUser(user) {
  await pool.query('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]);
  return getUserById(user.id);
}
async function createSession(id, userId, expiresAt) { await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [id, userId, expiresAt]); }
async function getSessionUserId(id) { if (!id) return null; const result = await pool.query('SELECT user_id AS "userId" FROM sessions WHERE id = $1 AND expires_at > now()', [id]); return result.rows[0]?.userId || null; }
async function deleteSession(id) { if (id) await pool.query('DELETE FROM sessions WHERE id = $1', [id]); }
async function purgeExpiredSessions() { await pool.query('DELETE FROM sessions WHERE expires_at <= now()'); }
async function deleteUser(userId) { await pool.query('DELETE FROM users WHERE id = $1', [userId]); }
async function healthCheck() { await pool.query('SELECT 1'); }
async function recordAppError(event) { await pool.query('INSERT INTO app_errors (id, method, path, message) VALUES ($1,$2,$3,$4)', [event.id, event.method, event.path, event.message]); }
async function recordUsageEvent(userId, eventName) { await pool.query('INSERT INTO usage_events (id, user_id, event_name) VALUES ($1,$2,$3)', [require('node:crypto').randomUUID(), userId, eventName]); }
async function getUsageOverview() {
  const totals = (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM users) AS "totalUsers",
    (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - INTERVAL '7 days') AS "newUsers7d",
    (SELECT COUNT(*)::int FROM profiles) AS "profilesCompleted",
    (SELECT COUNT(DISTINCT user_id)::int FROM workouts) AS "usersWithWorkout",
    (SELECT COUNT(*)::int FROM (SELECT user_id FROM workouts WHERE outcome='completed' GROUP BY user_id HAVING COUNT(*) >= 2) active) AS "usersWithTwoWorkouts",
    (SELECT COUNT(DISTINCT user_id)::int FROM coach_messages WHERE role='user') AS "coachUsers",
    (SELECT COUNT(*)::int FROM strava_connections) AS "stravaConnections",
    (SELECT COUNT(DISTINCT user_id)::int FROM usage_events WHERE occurred_at >= now() - INTERVAL '7 days') AS "activeUsers7d"`)).rows[0];
  const events = (await pool.query(`SELECT event_name AS "eventName", COUNT(*)::int AS count, COUNT(DISTINCT user_id)::int AS users
    FROM usage_events WHERE occurred_at >= now() - INTERVAL '28 days' GROUP BY event_name ORDER BY count DESC`)).rows;
  return { totals, events, generatedAt: new Date().toISOString() };
}
async function getOwnerUserHealth() {
  return (await pool.query(`WITH workout_stats AS (
      SELECT user_id, COUNT(*) FILTER (WHERE outcome='completed')::int AS completed,
        COUNT(*) FILTER (WHERE outcome='completed' AND logged_at >= now() - INTERVAL '7 days')::int AS "completed7d",
        MAX(logged_at) AS "lastWorkoutAt" FROM workouts GROUP BY user_id
    ), coach_stats AS (
      SELECT user_id, COUNT(*)::int AS messages, MAX(created_at) AS "lastCoachAt" FROM coach_messages WHERE role='user' GROUP BY user_id
    ), usage_stats AS (
      SELECT user_id, MAX(occurred_at) AS "lastUsageAt" FROM usage_events GROUP BY user_id
    )
    SELECT u.name, u.email, u.created_at AS "createdAt", p.goal,
      (p.user_id IS NOT NULL) AS "profileReady", COALESCE(array_length(p.training_days,1),0)::int AS "preferredDays",
      COALESCE(w.completed,0)::int AS "completedWorkouts", COALESCE(w."completed7d",0)::int AS "completedWorkouts7d", w."lastWorkoutAt",
      COALESCE(c.messages,0)::int AS "coachMessages", (s.user_id IS NOT NULL) AS "stravaConnected",
      GREATEST(u.created_at,w."lastWorkoutAt",c."lastCoachAt",x."lastUsageAt") AS "lastActiveAt"
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN workout_stats w ON w.user_id=u.id
      LEFT JOIN coach_stats c ON c.user_id=u.id LEFT JOIN usage_stats x ON x.user_id=u.id LEFT JOIN strava_connections s ON s.user_id=u.id
    ORDER BY "lastActiveAt" DESC NULLS LAST, u.created_at DESC LIMIT 1000`)).rows;
}
async function getSystemOverview() {
  const status = (await pool.query(`SELECT
    COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours')::int AS "errors24h",
    COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days')::int AS "errors7d",
    MAX(created_at) AS "lastErrorAt",
    (SELECT MAX(occurred_at) FROM usage_events) AS "lastUsageAt",
    (SELECT MAX(imported_at) FROM strava_activities) AS "lastStravaImportAt",
    (SELECT COUNT(*)::int FROM strava_activities WHERE imported_at >= now() - INTERVAL '7 days') AS "stravaImports7d"
    FROM app_errors`)).rows[0];
  const recentErrors = (await pool.query(`SELECT id, method, path, created_at AS "createdAt" FROM app_errors ORDER BY created_at DESC LIMIT 8`)).rows;
  return { database: 'operational', ...status, recentErrors, generatedAt: new Date().toISOString() };
}
async function upsertProfile(userId, profile) {
  await pool.query(`INSERT INTO profiles (user_id, goal, training_days, session_minutes, training_level, equipment, training_location, timezone, baseline, constraints, health_consent, ai_consent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
    ON CONFLICT (user_id) DO UPDATE SET goal=EXCLUDED.goal, training_days=EXCLUDED.training_days, session_minutes=EXCLUDED.session_minutes,
      training_level=EXCLUDED.training_level, equipment=EXCLUDED.equipment, training_location=EXCLUDED.training_location, timezone=EXCLUDED.timezone, baseline=EXCLUDED.baseline, constraints=EXCLUDED.constraints,
      health_consent=EXCLUDED.health_consent, ai_consent=EXCLUDED.ai_consent, updated_at=now()`, [userId, profile.goal, profile.trainingDays, profile.sessionMinutes, profile.trainingLevel, profile.equipment, profile.trainingLocation, profile.timezone, JSON.stringify(profile.baseline || {}), profile.constraints, profile.healthConsent, profile.aiConsent]);
  return getUserById(userId);
}
async function markMissedToday(userId) { await pool.query('UPDATE users SET missed_today_at = now() WHERE id = $1', [userId]); return getUserById(userId); }
async function getWorkouts(userId) { return (await pool.query('SELECT id, title, type, outcome, duration_minutes AS "durationMinutes", perceived_effort AS "perceivedEffort", note, details, source, logged_at AS "loggedAt" FROM workouts WHERE user_id = $1 ORDER BY logged_at DESC', [userId])).rows; }
async function addWorkout(userId, workout) {
  const saved = { id: workout.id, userId, title: workout.title, type: workout.type, outcome: workout.outcome, durationMinutes: workout.durationMinutes, perceivedEffort: workout.perceivedEffort, note: workout.note, details: workout.details || {}, source: workout.source, loggedAt: workout.loggedAt };
  await pool.query(`INSERT INTO workouts (id, user_id, title, type, outcome, duration_minutes, perceived_effort, note, details, source, logged_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [saved.id, saved.userId, saved.title, saved.type, saved.outcome, saved.durationMinutes, saved.perceivedEffort, saved.note, JSON.stringify(saved.details), saved.source, saved.loggedAt]);
  return { ...saved, userId: undefined };
}
async function updateWorkout(userId, workout) {
  const result = await pool.query(`UPDATE workouts
    SET title=$3, type=$4, outcome=$5, duration_minutes=$6, perceived_effort=$7, note=$8, details=$9::jsonb, logged_at=$10
    WHERE id=$1 AND user_id=$2
    RETURNING id, title, type, outcome, duration_minutes AS "durationMinutes", perceived_effort AS "perceivedEffort", note, details, source, logged_at AS "loggedAt"`,
  [workout.id, userId, workout.title, workout.type, workout.outcome, workout.durationMinutes, workout.perceivedEffort, workout.note, JSON.stringify(workout.details || {}), workout.loggedAt]);
  return result.rows[0] || null;
}
async function addTesterFeedback(userId, message) {
  const feedback = { id: require('node:crypto').randomUUID(), userId, message: String(message).trim(), createdAt: new Date().toISOString() };
  await pool.query('INSERT INTO tester_feedback (id, user_id, message, created_at) VALUES ($1,$2,$3,$4)', [feedback.id, feedback.userId, feedback.message, feedback.createdAt]);
  return feedback;
}
async function createCoachConversation(userId, title = 'New conversation') { const conversation = { id: require('node:crypto').randomUUID(), userId, title: String(title).trim().slice(0, 80) || 'New conversation', createdAt: new Date().toISOString() }; await pool.query('INSERT INTO coach_conversations (id, user_id, title, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)', [conversation.id, conversation.userId, conversation.title, conversation.createdAt]); return conversation; }
async function getCoachConversations(userId) { return (await pool.query('SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM coach_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 40', [userId])).rows; }
async function getCoachConversation(userId, conversationId) { return (await pool.query('SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM coach_conversations WHERE user_id = $1 AND id = $2', [userId, conversationId])).rows[0] || null; }
async function getLatestCoachConversation(userId) { let conversation = (await pool.query('SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM coach_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId])).rows[0]; if (conversation) return conversation; conversation = await createCoachConversation(userId, 'Earlier coach notes'); await pool.query('UPDATE coach_messages SET conversation_id = $1 WHERE user_id = $2 AND conversation_id IS NULL', [conversation.id, userId]); return conversation; }
async function getCoachMessages(userId, conversationId) { return (await pool.query('SELECT * FROM (SELECT id, role, content, created_at AS "createdAt" FROM coach_messages WHERE user_id = $1 AND conversation_id = $2 ORDER BY created_at DESC LIMIT 40) recent ORDER BY "createdAt" ASC', [userId, conversationId])).rows; }
async function addCoachMessage(userId, conversationId, role, content) { const message = { id: require('node:crypto').randomUUID(), role, content, createdAt: new Date().toISOString() }; await pool.query('INSERT INTO coach_messages (id, user_id, conversation_id, role, content, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [message.id, userId, conversationId, message.role, message.content, message.createdAt]); await pool.query("UPDATE coach_conversations SET updated_at = $1, title = CASE WHEN title = 'New conversation' AND $4 = 'user' THEN LEFT($5, 58) ELSE title END WHERE id = $2 AND user_id = $3", [message.createdAt, conversationId, userId, role, content]); return message; }
async function deleteCoachConversation(userId, conversationId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query('SELECT id FROM coach_conversations WHERE id = $1 AND user_id = $2 FOR UPDATE', [conversationId, userId]);
    if (!owned.rowCount) { await client.query('ROLLBACK'); return false; }
    await client.query('DELETE FROM coach_messages WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
    await client.query('DELETE FROM coach_conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function getStravaConnection(userId) { const row = (await pool.query('SELECT user_id AS "userId", athlete_id AS "athleteId", access_token AS "accessToken", refresh_token AS "refreshToken", expires_at AS "expiresAt", scope, connected_at AS "connectedAt" FROM strava_connections WHERE user_id = $1', [userId])).rows[0]; return row || null; }
async function upsertStravaConnection(userId, connection) { await pool.query(`INSERT INTO strava_connections (user_id, athlete_id, access_token, refresh_token, expires_at, scope) VALUES ($1,$2,$3,$4,$5,$6)
  ON CONFLICT (user_id) DO UPDATE SET athlete_id=EXCLUDED.athlete_id, access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, expires_at=EXCLUDED.expires_at, scope=EXCLUDED.scope, connected_at=now()`, [userId, connection.athleteId, connection.accessToken, connection.refreshToken, connection.expiresAt, connection.scope]); }
async function deleteStravaConnection(userId) { await pool.query('DELETE FROM strava_connections WHERE user_id = $1', [userId]); }
async function addStravaActivity(userId, activity, workoutId) { await pool.query(`INSERT INTO strava_activities (strava_id, user_id, workout_id, name, sport_type, started_at, duration_seconds, distance_meters, elevation_gain, average_heartrate)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (strava_id) DO NOTHING`, [activity.id, userId, workoutId, activity.name, activity.sport_type || activity.type || 'Activity', activity.start_date, Math.round(activity.moving_time || activity.elapsed_time || 0), activity.distance || null, activity.total_elevation_gain || null, activity.average_heartrate || null]); }
async function hasStravaActivity(stravaId) { return Boolean((await pool.query('SELECT 1 FROM strava_activities WHERE strava_id = $1', [stravaId])).rowCount); }
async function getActivityDashboard(userId, weekStart, weekEnd, today) {
  const weekly = (await pool.query(`SELECT COALESCE(SUM(distance_meters),0) AS "distanceMeters", COALESCE(SUM(duration_seconds),0) AS "durationSeconds", AVG(average_heartrate) AS "averageHeartRate", COUNT(*)::int AS "activityCount" FROM strava_activities WHERE user_id = $1 AND started_at >= $2::date AND started_at < ($3::date + INTERVAL '1 day')`, [userId, weekStart, weekEnd])).rows[0];
  const daily = (await pool.query(`SELECT COALESCE(SUM(duration_seconds),0) AS "durationSeconds", AVG(average_heartrate) AS "averageHeartRate", COUNT(*)::int AS "activityCount" FROM strava_activities WHERE user_id = $1 AND started_at >= $2::date AND started_at < ($2::date + INTERVAL '1 day')`, [userId, today])).rows[0];
  const manualWeekly = (await pool.query(`SELECT COALESCE(SUM(NULLIF(details #>> '{running,distance}', '')::numeric),0) AS "distanceMiles", AVG(NULLIF(details #>> '{running,averageHeartRate}', '')::numeric) AS "averageHeartRate" FROM workouts WHERE user_id = $1 AND outcome = 'completed' AND logged_at >= $2::date AND logged_at < ($3::date + INTERVAL '1 day')`, [userId, weekStart, weekEnd])).rows[0];
  const manualDaily = (await pool.query(`SELECT COALESCE(SUM(NULLIF(details #>> '{running,distance}', '')::numeric),0) AS "distanceMiles", AVG(NULLIF(details #>> '{running,averageHeartRate}', '')::numeric) AS "averageHeartRate" FROM workouts WHERE user_id = $1 AND outcome = 'completed' AND logged_at >= $2::date AND logged_at < ($2::date + INTERVAL '1 day')`, [userId, today])).rows[0];
  weekly.distanceMeters = Number(weekly.distanceMeters || 0) + Number(manualWeekly.distanceMiles || 0) * 1609.344;
  daily.averageHeartRate = daily.averageHeartRate || manualDaily.averageHeartRate;
  return { weekly, daily };
}
async function getDashboardRange(userId, start, end) {
  const workouts = (await pool.query(`SELECT COUNT(*)::int AS "workoutCount", COALESCE(SUM(duration_minutes),0)::int AS "durationMinutes",
    COUNT(*) FILTER (WHERE type ILIKE '%strength%' OR type ILIKE '%lift%')::int AS "liftingSessions",
    COUNT(*) FILTER (WHERE type ILIKE '%run%')::int AS "runningSessions",
    COALESCE(SUM(NULLIF(details #>> '{running,distance}', '')::numeric),0) AS "manualDistanceMiles"
    FROM workouts WHERE user_id = $1 AND outcome = 'completed' AND logged_at >= $2::date AND logged_at < ($3::date + INTERVAL '1 day')`, [userId, start, end])).rows[0];
  const activities = (await pool.query(`SELECT COALESCE(SUM(distance_meters),0) AS "distanceMeters", AVG(average_heartrate) AS "averageHeartRate",
    COUNT(*)::int AS "activityCount" FROM strava_activities WHERE user_id = $1 AND started_at >= $2::date AND started_at < ($3::date + INTERVAL '1 day')`, [userId, start, end])).rows[0];
  activities.distanceMeters = Number(activities.distanceMeters || 0) + Number(workouts.manualDistanceMiles || 0) * 1609.344;
  return { workouts, activities };
}
async function getPlanOverrides(userId, weekStart, weekEnd) { return (await pool.query('SELECT session_date::text AS date, alternative_id AS "alternativeId", title, type, intensity, exercises FROM plan_overrides WHERE user_id = $1 AND session_date >= $2::date AND session_date <= $3::date', [userId, weekStart, weekEnd])).rows; }
async function upsertPlanOverride(userId, date, alternative) { await pool.query(`INSERT INTO plan_overrides (user_id, session_date, alternative_id, title, type, intensity, exercises) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
  ON CONFLICT (user_id, session_date) DO UPDATE SET alternative_id=EXCLUDED.alternative_id, title=EXCLUDED.title, type=EXCLUDED.type, intensity=EXCLUDED.intensity, exercises=EXCLUDED.exercises, updated_at=now()`, [userId, date, alternative.id, alternative.title, alternative.type, alternative.intensity, JSON.stringify(alternative.exercises)]); }
async function getFriendships(userId) { return (await pool.query(`SELECT f.id, f.status, f.requester_id AS "requesterId", f.recipient_id AS "recipientId", u.name, u.email
  FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.recipient_id ELSE f.requester_id END
  WHERE f.requester_id = $1 OR f.recipient_id = $1 ORDER BY f.created_at DESC`, [userId])).rows; }
async function createFriendRequest(requesterId, recipientId) { await pool.query('INSERT INTO friendships (id, requester_id, recipient_id, status) VALUES ($1,$2,$3,$4)', [require('node:crypto').randomUUID(), requesterId, recipientId, 'pending']); }
async function acceptFriendRequest(userId, requestId) { return (await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1 AND recipient_id = $2 AND status = 'pending'`, [requestId, userId])).rowCount; }
async function getFriendActivities(friendIds) { if (!friendIds.length) return []; return (await pool.query(`SELECT w.user_id AS "userId", w.title, w.type, w.duration_minutes AS "durationMinutes", w.perceived_effort AS "perceivedEffort", w.details, w.logged_at AS "loggedAt", u.name
  FROM workouts w JOIN users u ON u.id = w.user_id WHERE w.user_id = ANY($1::uuid[]) AND w.outcome = 'completed' ORDER BY w.logged_at DESC LIMIT 60`, [friendIds])).rows; }
async function getDailyCheckin(userId, date) { return (await pool.query('SELECT available_minutes AS "availableMinutes", energy, training_mode AS "trainingMode", setup FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date', [userId, date])).rows[0] || null; }
async function upsertDailyCheckin(userId, date, checkin) { await pool.query(`INSERT INTO daily_checkins (user_id, checkin_date, available_minutes, energy, training_mode, setup) VALUES ($1,$2,$3,$4,$5,$6)
  ON CONFLICT (user_id, checkin_date) DO UPDATE SET available_minutes=EXCLUDED.available_minutes, energy=EXCLUDED.energy, training_mode=EXCLUDED.training_mode, setup=EXCLUDED.setup, updated_at=now()`, [userId, date, checkin.availableMinutes, checkin.energy, checkin.trainingMode || 'auto', checkin.setup || 'auto']); return getDailyCheckin(userId, date); }
async function getDailyReset(userId, date) { return (await pool.query('SELECT action, completed_at AS "completedAt" FROM daily_resets WHERE user_id = $1 AND reset_date = $2::date', [userId, date])).rows[0] || null; }
async function upsertDailyReset(userId, date, action) { return (await pool.query(`INSERT INTO daily_resets (user_id, reset_date, action) VALUES ($1,$2,$3)
  ON CONFLICT (user_id, reset_date) DO UPDATE SET action=EXCLUDED.action, completed_at=now()
  RETURNING action, completed_at AS "completedAt"`, [userId, date, action])).rows[0]; }
async function getPreviousTrainingWheelSnapshot(userId, beforeWeekStart) {
  return (await pool.query(`SELECT snapshot FROM training_wheel_snapshots
    WHERE user_id = $1 AND week_start < $2::date ORDER BY week_start DESC LIMIT 1`, [userId, beforeWeekStart])).rows[0]?.snapshot || null;
}
async function upsertTrainingWheelSnapshot(userId, wheel) {
  await pool.query(`INSERT INTO training_wheel_snapshots (user_id, week_start, week_end, snapshot)
    VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (user_id, week_start) DO UPDATE
    SET week_end=EXCLUDED.week_end, snapshot=EXCLUDED.snapshot, updated_at=now()`,
  [userId, wheel.weekStart, wheel.weekEnd, JSON.stringify(wheel)]);
}
module.exports = { pool, initSchema, getUserById, getUserByEmail, createUser, createSession, getSessionUserId, deleteSession, purgeExpiredSessions, deleteUser, healthCheck, recordAppError, recordUsageEvent, getUsageOverview, getOwnerUserHealth, getSystemOverview, upsertProfile, markMissedToday, getWorkouts, addWorkout, updateWorkout, addTesterFeedback, createCoachConversation, getCoachConversations, getCoachConversation, getLatestCoachConversation, getCoachMessages, addCoachMessage, deleteCoachConversation, getStravaConnection, upsertStravaConnection, deleteStravaConnection, addStravaActivity, hasStravaActivity, getActivityDashboard, getDashboardRange, getPlanOverrides, upsertPlanOverride, getFriendships, createFriendRequest, acceptFriendRequest, getFriendActivities, getDailyCheckin, upsertDailyCheckin, getDailyReset, upsertDailyReset, getPreviousTrainingWheelSnapshot, upsertTrainingWheelSnapshot };
