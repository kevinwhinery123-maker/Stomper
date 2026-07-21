const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'db.js'), 'utf8');

test('all owner dashboard endpoints require owner authorization', () => {
  for (const route of ['/api/admin/usage', '/api/admin/users', '/api/admin/system']) {
    const start = server.indexOf(`url.pathname === '${route}'`);
    assert.notEqual(start, -1, `${route} should exist`);
    assert.match(server.slice(start, start + 360), /if \(!isOwner\(user\)\) return json\(response, 403/);
  }
});

test('owner user-health query excludes private content fields', () => {
  const start = database.indexOf('async function getOwnerUserHealth');
  const end = database.indexOf('async function getSystemOverview', start);
  const query = database.slice(start, end);
  assert.match(query, /u\.name, u\.email/);
  assert.match(query, /completedWorkouts/);
  assert.doesNotMatch(query, /password_hash|constraints|health_consent|note|content/);
});

test('system overview exposes error references and routes but not stored messages', () => {
  const start = database.indexOf('async function getSystemOverview');
  const end = database.indexOf('async function upsertProfile', start);
  const query = database.slice(start, end);
  assert.match(query, /SELECT id, method, path/);
  assert.doesNotMatch(query, /SELECT id, method, path, message/);
});
