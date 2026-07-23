// One-time owner utility: safely changes the sign-in email for an existing Tempo account.
// Run: node change-tempo-account-email.js old@example.com new@example.com
require('dotenv').config();
const { Pool } = require('pg');

const [oldEmail = '', newEmail = ''] = process.argv.slice(2).map(value => String(value).trim().toLowerCase());
const validEmail = value => /^\S+@\S+\.\S+$/.test(value);

async function changeEmail() {
  if (!validEmail(oldEmail) || !validEmail(newEmail)) throw new Error('Use two valid email addresses: old address first, then new address.');
  if (oldEmail === newEmail) throw new Error('The new email must be different from the old email.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const oldUser = (await pool.query('SELECT id FROM users WHERE email = $1', [oldEmail])).rows[0];
    if (!oldUser) throw new Error('No Tempo account uses the old email address. Nothing was changed.');
    const newUser = (await pool.query('SELECT id FROM users WHERE email = $1', [newEmail])).rows[0];
    if (newUser) throw new Error('A Tempo account already uses the new email address. Nothing was changed.');
    await pool.query('UPDATE users SET email = $2 WHERE id = $1', [oldUser.id, newEmail]);
    console.log(`Tempo account email changed to ${newEmail}. You can now sign in with that address.`);
  } finally {
    await pool.end();
  }
}

changeEmail().catch(error => { console.error(`Email change failed: ${error.message}`); process.exitCode = 1; });
