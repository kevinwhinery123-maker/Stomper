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
