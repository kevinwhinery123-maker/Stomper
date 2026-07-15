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
    profile: row.goal ? { goal: row.goal, trainingDays: row.training_days, sessionMinutes: row.session_minutes, trainingLevel: row.training_level, equipment: row.equipment, timezone: row.timezone, constraints: row.constraints, healthConsent: row.health_consent, updatedAt: row.updated_at } : null
  };
}
const userSelect = `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.missed_today_at,
  p.goal, p.training_days, p.session_minutes, p.training_level, p.equipment, p.timezone, p.constraints, p.health_consent, p.updated_at
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
      constraints TEXT NOT NULL DEFAULT '', health_consent BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, type TEXT NOT NULL, outcome TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      perceived_effort INTEGER, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS workouts_user_logged_at_idx ON workouts(user_id, logged_at DESC);
  `);
}
async function getUserById(id) { return toUser((await pool.query(`${userSelect} WHERE u.id = $1`, [id])).rows[0]); }
async function getUserByEmail(email) { return toUser((await pool.query(`${userSelect} WHERE u.email = $1`, [email])).rows[0]); }
async function createUser(user) {
  await pool.query('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]);
  return getUserById(user.id);
}
async function upsertProfile(userId, profile) {
  await pool.query(`INSERT INTO profiles (user_id, goal, training_days, session_minutes, training_level, equipment, timezone, constraints, health_consent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id) DO UPDATE SET goal=EXCLUDED.goal, training_days=EXCLUDED.training_days, session_minutes=EXCLUDED.session_minutes,
      training_level=EXCLUDED.training_level, equipment=EXCLUDED.equipment, timezone=EXCLUDED.timezone, constraints=EXCLUDED.constraints,
      health_consent=EXCLUDED.health_consent, updated_at=now()`, [userId, profile.goal, profile.trainingDays, profile.sessionMinutes, profile.trainingLevel, profile.equipment, profile.timezone, profile.constraints, profile.healthConsent]);
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
module.exports = { pool, initSchema, getUserById, getUserByEmail, createUser, upsertProfile, markMissedToday, getWorkouts, addWorkout };
