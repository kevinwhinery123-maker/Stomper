const test = require('node:test');
const assert = require('node:assert/strict');
process.env.STRAVA_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
const { encrypt, decrypt } = require('../strava');

test('encrypts stored Strava tokens and decrypts them only on the server', () => {
  const secret = 'temporary-access-token';
  const encrypted = encrypt(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decrypt(encrypted), secret);
});
