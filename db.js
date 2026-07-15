// Database layer: all Neon/PostgreSQL access lives here, separate from HTTP routes.
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Add it to the .env file.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role,
    createdAt: row.created_at, missedToday: row.missed_today_at ? { at: row.missed_today_at } : null,
    profile: row.goal ? { goal: row.goal, trainingDays: row.training_days, sessionMinutes: row.session_minutes, trainingLevel: row.training_level, equipment: row.equipment, timezone: row.timezone, constraints: row.constraints, healthConsent: row.health_consent, aiConsent: row.ai_consent, updatedAt: row.updated_at } : null
  };
}
const userSelect = `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.missed_today_at,
  p.goal, p.training_days, p.session_minutes, p.training_level, p.equipment, p.timezone, p.constraints, p.health_consent, p.ai_consent, p.updated_at
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
      training_level TEXT NOT NULL, equipment TEXT NOT NULL, timezone TEXT NOT NULL,
      constraints TEXT NOT NULL DEFAULT '', health_consent BOOLEAN NOT NULL DEFAULT false, ai_consent BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_consent BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS workouts (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, type TEXT NOT NULL, outcome TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      perceived_effort INTEGER, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS workouts_user_logged_at_idx ON workouts(user_id, logged_at DESC);
    CREATE TABLE IF NOT EXISTS coach_messages (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS coach_messages_user_created_at_idx ON coach_messages(user_id, created_at DESC);
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
  `);
}
async function getUserById(id) { return toUser((await pool.query(`${userSelect} WHERE u.id = $1`, [id])).rows[0]); }
async function getUserByEmail(email) { return toUser((await pool.query(`${userSelect} WHERE u.email = $1`, [email])).rows[0]); }
async function createUser(user) {
  await pool.query('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]);
  return getUserById(user.id);
}
async function upsertProfile(userId, profile) {
  await pool.query(`INSERT INTO profiles (user_id, goal, training_days, session_minutes, training_level, equipment, timezone, constraints, health_consent, ai_consent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (user_id) DO UPDATE SET goal=EXCLUDED.goal, training_days=EXCLUDED.training_days, session_minutes=EXCLUDED.session_minutes,
      training_level=EXCLUDED.training_level, equipment=EXCLUDED.equipment, timezone=EXCLUDED.timezone, constraints=EXCLUDED.constraints,
      health_consent=EXCLUDED.health_consent, ai_consent=EXCLUDED.ai_consent, updated_at=now()`, [userId, profile.goal, profile.trainingDays, profile.sessionMinutes, profile.trainingLevel, profile.equipment, profile.timezone, profile.constraints, profile.healthConsent, profile.aiConsent]);
  return getUserById(userId);
}
async function markMissedToday(userId) { await pool.query('UPDATE users SET missed_today_at = now() WHERE id = $1', [userId]); return getUserById(userId); }
async function getWorkouts(userId) { return (await pool.query('SELECT id, title, type, outcome, duration_minutes AS "durationMinutes", perceived_effort AS "perceivedEffort", note, source, logged_at AS "loggedAt" FROM workouts WHERE user_id = $1 ORDER BY logged_at DESC', [userId])).rows; }
async function addWorkout(userId, workout) {
  const saved = { id: workout.id, userId, title: workout.title, type: workout.type, outcome: workout.outcome, durationMinutes: workout.durationMinutes, perceivedEffort: workout.perceivedEffort, note: workout.note, source: workout.source, loggedAt: workout.loggedAt };
  await pool.query(`INSERT INTO workouts (id, user_id, title, type, outcome, duration_minutes, perceived_effort, note, source, logged_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [saved.id, saved.userId, saved.title, saved.type, saved.outcome, saved.durationMinutes, saved.perceivedEffort, saved.note, saved.source, saved.loggedAt]);
  return { ...saved, userId: undefined };
}
async function getCoachMessages(userId) { return (await pool.query('SELECT * FROM (SELECT id, role, content, created_at AS "createdAt" FROM coach_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30) recent ORDER BY "createdAt" ASC', [userId])).rows; }
async function addCoachMessage(userId, role, content) { const message = { id: require('node:crypto').randomUUID(), role, content, createdAt: new Date().toISOString() }; await pool.query('INSERT INTO coach_messages (id, user_id, role, content, created_at) VALUES ($1,$2,$3,$4,$5)', [message.id, userId, message.role, message.content, message.createdAt]); return message; }
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
  return { weekly, daily };
}
async function getDashboardRange(userId, start, end) {
  const workouts = (await pool.query(`SELECT COUNT(*)::int AS "workoutCount", COALESCE(SUM(duration_minutes),0)::int AS "durationMinutes",
    COUNT(*) FILTER (WHERE type ILIKE '%strength%' OR type ILIKE '%lift%')::int AS "liftingSessions",
    COUNT(*) FILTER (WHERE type ILIKE '%run%')::int AS "runningSessions"
    FROM workouts WHERE user_id = $1 AND outcome = 'completed' AND logged_at >= $2::date AND logged_at < ($3::date + INTERVAL '1 day')`, [userId, start, end])).rows[0];
  const activities = (await pool.query(`SELECT COALESCE(SUM(distance_meters),0) AS "distanceMeters", AVG(average_heartrate) AS "averageHeartRate",
    COUNT(*)::int AS "activityCount" FROM strava_activities WHERE user_id = $1 AND started_at >= $2::date AND started_at < ($3::date + INTERVAL '1 day')`, [userId, start, end])).rows[0];
  return { workouts, activities };
}
async function getPlanOverrides(userId, weekStart, weekEnd) { return (await pool.query('SELECT session_date::text AS date, alternative_id AS "alternativeId", title, type, intensity, exercises FROM plan_overrides WHERE user_id = $1 AND session_date >= $2::date AND session_date <= $3::date', [userId, weekStart, weekEnd])).rows; }
async function upsertPlanOverride(userId, date, alternative) { await pool.query(`INSERT INTO plan_overrides (user_id, session_date, alternative_id, title, type, intensity, exercises) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
  ON CONFLICT (user_id, session_date) DO UPDATE SET alternative_id=EXCLUDED.alternative_id, title=EXCLUDED.title, type=EXCLUDED.type, intensity=EXCLUDED.intensity, exercises=EXCLUDED.exercises, updated_at=now()`, [userId, date, alternative.id, alternative.title, alternative.type, alternative.intensity, JSON.stringify(alternative.exercises)]); }
module.exports = { pool, initSchema, getUserById, getUserByEmail, createUser, upsertProfile, markMissedToday, getWorkouts, addWorkout, getCoachMessages, addCoachMessage, getStravaConnection, upsertStravaConnection, deleteStravaConnection, addStravaActivity, hasStravaActivity, getActivityDashboard, getDashboardRange, getPlanOverrides, upsertPlanOverride };
