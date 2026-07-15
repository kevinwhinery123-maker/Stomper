/**
 * Tempo local development server.
 *
 * This intentionally uses only Node's built-in modules so you can run and
 * understand it without installing a framework. It is suitable for local
 * testing, NOT public deployment: see README.md for the production migration.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { generatePlan } = require('./plan-engine');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const sessions = new Map(); // A production app stores sessions in Redis/a database.

function emptyStore() { return { users: [] }; }
function readStore() {
  if (!fs.existsSync(DATA_FILE)) return emptyStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function passwordMatches(password, stored) {
  const [salt, savedHash] = stored.split(':');
  const suppliedHash = passwordHash(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(savedHash, 'hex'), Buffer.from(suppliedHash, 'hex'));
}
function publicUser(user) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(item => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}
function currentUser(request) {
  const sessionId = parseCookies(request).tempo_session;
  const userId = sessions.get(sessionId);
  if (!userId) return null;
  return readStore().users.find(user => user.id === userId) || null;
}
function json(response, status, body, cookie) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  response.end(JSON.stringify(body));
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; if (raw.length > 100000) request.destroy(); });
    request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Please send valid JSON.')); } });
  });
}
function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) { json(response, 401, { error: 'Please sign in first.' }); return null; }
  return user;
}
function validateProfile(profile) {
  const goals = ['run_stronger', 'build_strength', 'both'];
  const levels = ['new', 'intermediate', 'advanced'];
  const equipment = ['bodyweight', 'home_gym', 'full_gym'];
  if (!goals.includes(profile.goal)) return 'Choose a valid training goal.';
  if (!levels.includes(profile.trainingLevel)) return 'Choose a valid training level.';
  if (!equipment.includes(profile.equipment)) return 'Choose valid equipment access.';
  if (!Array.isArray(profile.trainingDays) || profile.trainingDays.length < 1 || profile.trainingDays.length > 7) return 'Choose one to seven training days.';
  if (!profile.timezone || profile.timezone.length > 80) return 'Provide a valid timezone.';
  if (typeof profile.healthConsent !== 'boolean') return 'Choose whether you consent to storing optional constraints.';
  return null;
}
function validateWorkout(workout) {
  const outcomes = ['completed', 'partial', 'skipped'];
  if (!String(workout.title || '').trim()) return 'Give the workout a short name.';
  if (!outcomes.includes(workout.outcome)) return 'Choose whether the workout was completed, partial, or skipped.';
  const duration = Number(workout.durationMinutes);
  if (!Number.isFinite(duration) || duration < 0 || duration > 360) return 'Enter a duration from 0 to 360 minutes.';
  const effort = workout.perceivedEffort === '' || workout.perceivedEffort === undefined ? null : Number(workout.perceivedEffort);
  if (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) return 'Effort must be a whole number from 1 to 10.';
  if (String(workout.note || '').length > 500) return 'Keep notes to 500 characters or fewer.';
  return null;
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/me') {
    const user = currentUser(request);
    return json(response, 200, { user: user ? publicUser(user) : null });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const { name = '', email = '', password = '' } = await readJson(request);
    if (name.trim().length < 2) return json(response, 400, { error: 'Enter your name (at least 2 characters).' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(response, 400, { error: 'Enter a valid email address.' });
    if (password.length < 10) return json(response, 400, { error: 'Use a password with at least 10 characters.' });
    const store = readStore();
    if (store.users.some(user => user.email === email.trim().toLowerCase())) return json(response, 409, { error: 'An account with that email already exists.' });
    const user = { id: crypto.randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), passwordHash: passwordHash(password), role: 'consumer', createdAt: new Date().toISOString(), profile: null };
    store.users.push(user); writeStore(store);
    const sessionId = crypto.randomBytes(32).toString('hex'); sessions.set(sessionId, user.id);
    return json(response, 201, { user: publicUser(user) }, `tempo_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`);
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const { email = '', password = '' } = await readJson(request);
    const user = readStore().users.find(item => item.email === email.trim().toLowerCase());
    if (!user || !passwordMatches(password, user.passwordHash)) return json(response, 401, { error: 'Email or password is incorrect.' });
    const sessionId = crypto.randomBytes(32).toString('hex'); sessions.set(sessionId, user.id);
    return json(response, 200, { user: publicUser(user) }, `tempo_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`);
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    sessions.delete(parseCookies(request).tempo_session);
    return json(response, 200, { ok: true }, 'tempo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  }
  if (request.method === 'PUT' && url.pathname === '/api/profile') {
    const user = requireUser(request, response); if (!user) return;
    const profile = await readJson(request);
    const problem = validateProfile(profile); if (problem) return json(response, 400, { error: problem });
    const store = readStore(); const index = store.users.findIndex(item => item.id === user.id);
    store.users[index].profile = { goal: profile.goal, trainingDays: profile.trainingDays, sessionMinutes: Number(profile.sessionMinutes) || 45, trainingLevel: profile.trainingLevel, equipment: profile.equipment, timezone: profile.timezone, constraints: profile.healthConsent ? String(profile.constraints || '').slice(0, 1000) : '', healthConsent: profile.healthConsent, updatedAt: new Date().toISOString() };
    writeStore(store);
    return json(response, 200, { user: publicUser(store.users[index]) });
  }
  if (request.method === 'GET' && url.pathname === '/api/plan') {
    const user = requireUser(request, response); if (!user) return;
    if (!user.profile) return json(response, 400, { error: 'Save your coaching profile before generating a plan.' });
    return json(response, 200, { plan: generatePlan(user.profile, Boolean(user.missedToday)) });
  }
  if (request.method === 'POST' && url.pathname === '/api/plan/miss-today') {
    const user = requireUser(request, response); if (!user) return;
    if (!user.profile) return json(response, 400, { error: 'Save your coaching profile before adjusting a plan.' });
    const store = readStore(); const index = store.users.findIndex(item => item.id === user.id);
    store.users[index].missedToday = { at: new Date().toISOString() }; writeStore(store);
    return json(response, 200, { plan: generatePlan(store.users[index].profile, true) });
  }
  if (request.method === 'GET' && url.pathname === '/api/workouts') {
    const user = requireUser(request, response); if (!user) return;
    return json(response, 200, { workouts: [...(user.workouts || [])].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)) });
  }
  if (request.method === 'POST' && url.pathname === '/api/workouts') {
    const user = requireUser(request, response); if (!user) return;
    const workout = await readJson(request); const problem = validateWorkout(workout);
    if (problem) return json(response, 400, { error: problem });
    const store = readStore(); const index = store.users.findIndex(item => item.id === user.id);
    const savedWorkout = { id: crypto.randomUUID(), title: String(workout.title).trim().slice(0, 80), type: String(workout.type || 'other').slice(0, 40), outcome: workout.outcome, durationMinutes: Number(workout.durationMinutes), perceivedEffort: workout.perceivedEffort === '' || workout.perceivedEffort === undefined ? null : Number(workout.perceivedEffort), note: String(workout.note || '').trim().slice(0, 500), source: workout.source === 'plan' ? 'plan' : 'manual', loggedAt: new Date().toISOString() };
    store.users[index].workouts = store.users[index].workouts || [];
    store.users[index].workouts.push(savedWorkout); writeStore(store);
    return json(response, 201, { workout: savedWorkout });
  }
  return json(response, 404, { error: 'API route not found.' });
}
function serveFile(response, filePath) {
  const extension = path.extname(filePath); const contentType = extension === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  fs.readFile(filePath, (error, contents) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' }); response.end(contents);
  });
}
http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET') { response.writeHead(405); return response.end('Method not allowed'); }
    return serveFile(response, path.join(ROOT, url.pathname === '/' ? 'index.html' : path.basename(url.pathname)));
  } catch (error) { console.error(error); return json(response, 500, { error: 'Something went wrong. Check the terminal for details.' }); }
}).listen(PORT, () => console.log(`Tempo is running at http://localhost:${PORT}`));
