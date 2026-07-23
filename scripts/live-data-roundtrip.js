const assert = require('node:assert/strict');

const baseUrl = process.env.TEMPO_BASE_URL || 'http://localhost:3000';
const auditId = Date.now();
const email = `tempo-data-audit-${auditId}@example.test`;
const password = `TempoAudit!${auditId}`;
let cookie = '';
let accountCreated = false;
let accountDeleted = false;

function localDateKey(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = name => parts.find(part => part.type === name).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON (${response.status}).`);
  }
  if (options.expectedStatus && response.status !== options.expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path} returned ${response.status}: ${data.error || text}`);
  }
  return { status: response.status, data };
}

function closeTo(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(Number(actual) - expected) <= tolerance, `Expected ${actual} to be close to ${expected}`);
}

async function run() {
  const timezone = 'America/New_York';
  const today = localDateKey(timezone);
  const schedule = Object.fromEntries(
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => [
      day,
      {
        enabled: true,
        durationMode: 'fixed',
        minutes: 35 + index * 5,
        equipment: index % 2 ? 'full_gym' : 'bodyweight'
      }
    ])
  );

  const health = await request('/health', { expectedStatus: 200 });
  assert.equal(health.data.ok, true);

  const registration = await request('/api/auth/register', {
    method: 'POST',
    expectedStatus: 201,
    body: {
      name: 'Tempo Data Audit',
      email,
      password,
      adultConfirmation: true
    }
  });
  accountCreated = true;
  assert.ok(registration.data.user.id);
  assert.ok(cookie.startsWith('tempo_session='));

  const profilePayload = {
    goal: 'both',
    trainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    sessionMinutes: 45,
    trainingLevel: 'intermediate',
    equipment: 'full_gym',
    trainingLocation: 'both',
    timezone,
    constraints: 'This text must not persist without health consent.',
    healthConsent: false,
    aiConsent: false,
    baseline: {
      weeklyRunMiles: 12.5,
      longestRunMiles: 4.2,
      weeklyLiftSets: 18,
      averageDailySteps: 7000,
      weeklySwimYards: 0,
      longestSwimYards: 0,
      weeklyBikeMiles: 0,
      longestBikeMiles: 0,
      planStartedAt: today,
      weekSchedule: schedule,
      milestone: {
        kind: 'run_distance',
        targetDate: '2027-12-12',
        targetDistanceMiles: 6.2,
        liftName: '',
        targetWeight: 0,
        eventName: 'Audit 10K'
      },
      triathlon: {
        distance: '70.3',
        raceDate: '',
        raceGoal: 'finish',
        swimConfidence: 'learning',
        poolAccess: false,
        openWaterAccess: false,
        bikeAccess: false,
        trainerAccess: false
      }
    }
  };
  await request('/api/profile', {
    method: 'PUT',
    expectedStatus: 200,
    body: profilePayload
  });

  const me = await request('/api/me', { expectedStatus: 200 });
  assert.equal(me.data.user.email, email);
  assert.equal(me.data.user.profile.goal, 'both');
  assert.equal(me.data.user.profile.constraints, '');
  assert.equal(me.data.user.profile.baseline.weeklyRunMiles, 12.5);
  assert.equal(me.data.user.profile.baseline.weeklyLiftSets, 18);
  assert.equal(me.data.user.profile.baseline.milestone.eventName, 'Audit 10K');
  assert.deepEqual(me.data.user.profile.baseline.weekSchedule, schedule);

  const baselinePlan = await request('/api/plan', { expectedStatus: 200 });
  assert.equal(baselinePlan.data.plan.baseline.weeklyRunMiles, 12.5);
  assert.equal(baselinePlan.data.plan.dataSignals.baselineSource, 'user');
  assert.equal(baselinePlan.data.plan.sessions.length, 7);
  assert.equal(baselinePlan.data.plan.today.date, today);

  await request('/api/workouts', {
    method: 'POST',
    expectedStatus: 201,
    body: {
      title: 'Audit easy run',
      type: 'running',
      outcome: 'completed',
      durationMinutes: 31,
      perceivedEffort: 5,
      note: 'Disposable data-flow audit',
      loggedAt: today,
      source: 'manual',
      details: {
        running: {
          distance: 3.1,
          averagePace: '10:00',
          averageHeartRate: 145
        }
      }
    }
  });
  await request('/api/workouts', {
    method: 'POST',
    expectedStatus: 201,
    body: {
      title: 'Audit strength',
      type: 'lifting',
      outcome: 'completed',
      durationMinutes: 42,
      perceivedEffort: 6,
      note: 'Disposable data-flow audit',
      loggedAt: today,
      source: 'manual',
      details: {
        lifts: [
          {
            exercise: 'Back squat',
            sets: 4,
            reps: 8,
            weight: '135 lb'
          }
        ]
      }
    }
  });

  const workoutReadback = await request('/api/workouts', { expectedStatus: 200 });
  assert.equal(workoutReadback.data.workouts.length, 2);
  const run = workoutReadback.data.workouts.find(workout => workout.type === 'running');
  const lift = workoutReadback.data.workouts.find(workout => workout.type === 'lifting');
  assert.equal(run.details.running.distance, 3.1);
  assert.equal(run.details.running.averageHeartRate, 145);
  assert.equal(lift.details.lifts[0].sets, 4);
  assert.equal(lift.details.lifts[0].weight, '135 lb');

  const summary = await request('/api/fitness-summary', { expectedStatus: 200 });
  const current = summary.data.fitnessSummary.windows.current7;
  assert.equal(current.completedSessions, 2);
  assert.equal(current.trainingMinutes, 73);
  assert.equal(current.runningMiles, 3.1);
  assert.equal(current.liftingSets, 4);
  assert.ok(summary.data.fitnessSummary.dataQuality.sources.includes('manual'));
  assert.equal(summary.data.fitnessSummary.highlights.strength[0].exercise, 'Back squat');

  const dashboard = await request('/api/dashboard?range=week', { expectedStatus: 200 });
  assert.equal(dashboard.data.dashboard.workouts.workoutCount, 2);
  assert.equal(dashboard.data.dashboard.workouts.durationMinutes, 73);
  closeTo(dashboard.data.dashboard.workouts.manualDistanceMiles, 3.1);
  closeTo(dashboard.data.dashboard.activities.distanceMeters, 3.1 * 1609.344, 0.01);
  assert.equal(dashboard.data.activityGraph.series.run.total, 3.1);
  assert.equal(dashboard.data.activityGraph.series.lift.total, 4);

  const checkin = await request('/api/checkin', {
    method: 'POST',
    expectedStatus: 200,
    body: {
      availableMinutes: 20,
      energy: 'low',
      trainingMode: 'running',
      setup: 'outdoor'
    }
  });
  assert.deepEqual(checkin.data.plan.tempoCheck, {
    availableMinutes: 20,
    energy: 'low',
    trainingMode: 'running',
    setup: 'outdoor'
  });
  assert.equal(checkin.data.plan.today.session.minutes, 20);
  assert.equal(checkin.data.plan.today.session.intensity, 'Easy');

  const reset = await request('/api/reset', {
    method: 'POST',
    expectedStatus: 200,
    body: { action: 'mobility' }
  });
  assert.equal(reset.data.reset.action, 'mobility');
  assert.equal(reset.data.plan.dailyReset.action, 'mobility');
  assert.equal(reset.data.plan.trainingWheel.today.reset.score, 100);

  const updatedPlan = await request('/api/plan', { expectedStatus: 200 });
  assert.equal(updatedPlan.data.plan.fitnessSummary.windows.current7.completedSessions, 2);
  assert.equal(updatedPlan.data.plan.trainingWheel.status, 'active');
  assert.equal(updatedPlan.data.plan.trainingWheel.today.checkin.completed, true);
  assert.equal(updatedPlan.data.plan.trainingWheel.today.reset.action, 'mobility');
  assert.equal(updatedPlan.data.plan.activityGraph.series.run.total, 3.1);
  assert.equal(updatedPlan.data.plan.activityGraph.series.lift.total, 4);
  assert.equal(updatedPlan.data.plan.dataSignals.baselineSource, 'logged');

  const conversation = await request('/api/coach/conversations', {
    method: 'POST',
    expectedStatus: 201
  });
  const conversationId = conversation.data.conversation.id;
  const coach = await request('/api/coach', {
    method: 'POST',
    expectedStatus: 200,
    body: {
      conversationId,
      message: 'Review my recent training and tell me what the data shows.'
    }
  });
  assert.equal(coach.data.mode, 'preview');
  assert.ok(coach.data.message.content);
  const history = await request(`/api/coach?conversationId=${conversationId}`, {
    expectedStatus: 200
  });
  assert.equal(history.data.messages.length, 2);
  assert.equal(history.data.messages[0].role, 'user');
  assert.equal(history.data.messages[1].role, 'assistant');

  await request('/api/account', { method: 'DELETE', expectedStatus: 200 });
  accountDeleted = true;
  const afterDelete = await request('/api/me', { expectedStatus: 200 });
  assert.equal(afterDelete.data.user, null);

  return {
    profile: 'persisted and normalized',
    workouts: 'details persisted and read back',
    summaries: '2 sessions, 73 minutes, 3.1 miles, 4 sets',
    adaptation: 'check-in, reset, graph, wheel, and logged baseline synchronized',
    coach: 'conversation and both messages persisted',
    cleanup: 'test account deleted and session invalidated'
  };
}

(async () => {
  try {
    const result = await run();
    console.log('Tempo live data round-trip passed.');
    for (const [area, detail] of Object.entries(result)) console.log(`- ${area}: ${detail}`);
  } catch (error) {
    console.error(`Tempo live data round-trip failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (accountCreated && !accountDeleted) {
      try {
        await request('/api/account', { method: 'DELETE', expectedStatus: 200 });
        console.log('- cleanup: test account removed after failure');
      } catch (cleanupError) {
        console.error(`Cleanup failed for ${email}: ${cleanupError.message}`);
        process.exitCode = 1;
      }
    }
  }
})();
