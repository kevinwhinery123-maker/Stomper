const test = require('node:test');
const assert = require('node:assert/strict');
const { isMedicalOrSensitive } = require('../coach-safety');

test('blocks medical and injury language before it reaches the coach', () => {
  assert.equal(isMedicalOrSensitive('My knee pain is worse after training.'), true);
  assert.equal(isMedicalOrSensitive('Can you diagnose this injury?'), true);
  assert.equal(isMedicalOrSensitive('Why is my strength workout shorter?'), false);
});
