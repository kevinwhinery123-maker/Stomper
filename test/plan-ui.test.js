const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('plan detail enhancements use the selected day instead of always using Monday', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(
    html,
    /session=plan\.sessions\[selectedPlanSession\]/,
    'the visible workout card must use the session selected in the weekly plan'
  );
  assert.doesNotMatch(
    html,
    /querySelectorAll\('#planSessions \.session'\)\.forEach\(\(card,index\)=>\{const session=plan\.sessions\[index\]/,
    'a single visible detail card must not be paired with the first day of the week'
  );
});

test('weekly plan points new users to the progress chart on Today', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /class="plan-chart-cta card"/);
  assert.match(html, /onclick="showPage\('home'\)">Check out your chart/);
  assert.match(html, /#planGrid\[hidden\]\+\.plan-chart-cta\{display:none\}/);
});

test('daily Reset has an accessible explanation popup', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /aria-label="What is a Tempo Reset\?"/);
  assert.match(html, /id="tempoResetInfoDialog"/);
  assert.match(html, /Breathing or meditation/);
  assert.match(html, /Easy walk/);
  assert.match(html, /Mobility or stretching/);
  assert.match(html, /Full rest/);
  assert.match(html, /showModal\(\)/);
});

test('Reset help and dated goal guidance use helpful green styling and clear field descriptions', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /\.tempo-reset-info\{[^}]*border:1px solid #5f8e62[^}]*color:var\(--lime\)/);
  assert.match(html, /\.milestone-settings\{[^}]*border:1px solid #426a45!important[^}]*background:#0e2013/);
  assert.match(html, /id="milestoneLiftHelp">The exact exercise you want to improve/);
  assert.match(html, /id="milestoneWeightHelp">For a weighted lift, enter the total weight including the bar/);
  assert.match(html, /id="milestoneDistanceHelp">The event distance—or how far you want to run continuously/);
  assert.match(html, /aria-describedby="milestoneWeightHelp"/);
});
