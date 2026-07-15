// One-time migration from the local learning store to Neon.
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

async function migrate() {
  await db.initSchema();
  const file = path.join(__dirname, 'data', 'store.json');
  if (!fs.existsSync(file)) { console.log('No local data file found. Neon schema is ready.'); return; }
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const localUser of store.users || []) {
    let user = await db.getUserByEmail(localUser.email);
    if (!user) user = await db.createUser({ id: localUser.id, name: localUser.name, email: localUser.email, passwordHash: localUser.passwordHash, role: localUser.role || 'consumer', createdAt: localUser.createdAt || new Date().toISOString() });
    if (localUser.profile) await db.upsertProfile(user.id, localUser.profile);
    if (localUser.missedToday) await db.markMissedToday(user.id);
    for (const workout of localUser.workouts || []) {
      const existing = (await db.pool.query('SELECT 1 FROM workouts WHERE id = $1', [workout.id])).rowCount;
      if (!existing) await db.addWorkout(user.id, workout);
    }
  }
  console.log('Local accounts, profiles, and workouts migrated to Neon.');
}
migrate().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; }).finally(() => db.pool.end());
