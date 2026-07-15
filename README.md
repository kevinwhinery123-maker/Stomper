# Tempo fitness-coach prototype

## What is included

`index.html` is a self-contained, clickable product prototype for a personalized fitness coach. It deliberately uses local mock data so it can be tested before a backend exists.

It demonstrates four core moments:

1. **Today:** a current workout, weekly progress, and training rhythm.
2. **Build plan:** a three-step personalization flow for goal, availability, and experience.
3. **My plan:** a weekly prescription plus an explainable “why this week works” panel.
4. **Workout feedback:** completion and perceived effort—key signals for future adaptation.

Open `index.html` in a browser to test it. The navigation and all primary actions are interactive.

## Start the local app

1. Open a terminal in this folder.
2. Run `node server.js`.
3. Visit `http://localhost:3000`.

The server provides a real local account and profile API. Your test account data is saved in `data/store.json`; it is deliberately excluded from Git so passwords and test data do not get committed.

## Authentication and profiles, in plain English

**Authentication** answers “who is this person?” A user creates an account with an email address and password, then signs in. The server never stores the password itself: it stores a one-way *hash*, which is a deliberately scrambled version that can be checked but not reversed.

After sign-in, the browser receives a small session cookie. Think of it as a temporary claim ticket: on each request, the browser presents it and the server looks up the signed-in user. The cookie is `HttpOnly`, so page JavaScript cannot read it.

**A profile** answers “what kind of plan is appropriate for this person?” It stores the goal, available training days, session duration, experience, equipment, timezone, optional constraints, and whether the user consented to storing those constraints. The plan generator will read this profile later.

**Roles** answer “what can this person do?” Everyone registering now is a `consumer`. An `admin` role is reserved for a future staff dashboard; it should never be selectable on a public sign-up form.

### Important: local demo vs. publish-ready system

The included server is designed to teach and test the workflow. It keeps data in a local JSON file and keeps sessions in memory, so signing in again after restarting the server is expected. It is not the final security architecture.

For publishing, migrate users and profiles to PostgreSQL, store sessions in a durable session store, use a managed authentication provider or secure password-reset/email-verification flow, enforce HTTPS, set the cookie `Secure` flag, add rate limiting, and store secrets in environment variables. This is normal product progression—not a mistake in the local prototype.

## Personalized plan generation and missed workouts

`plan-engine.js` is the first coaching engine. It turns a saved profile into a weekly plan using readable rules instead of a black-box recommendation. It considers the chosen goal, days available, session length, experience, and equipment.

When a user selects **“I can’t train today”**, the app records that the day was missed and regenerates the plan. It does not pile the missed workout onto tomorrow. Instead, it inserts a short recovery/movement day, pushes a reduced high-value strength session later in the week, and explains the adjustment in the plan. This is deliberately conservative: early training products should protect consistency and recovery rather than encourage catch-up behavior.

Run `node --test` to check the two core plan behaviors. The tests are in `test/plan-engine.test.js` and are a good place to add a new test whenever you introduce a coaching rule.

## Workout logging and feedback

The **Workouts** tab saves completed, partial, and skipped activities. Users can record duration, effort from 1–10, and a short note. Plan sessions also have a quick completion check-in that saves the session and its feedback.

This is the next data layer the coach needs: a profile says what a person *intends* to do, while workout logs show what they *actually* did. A later rule can safely reduce an upcoming session after several high-effort workouts, or encourage a gradual return after a gap.

## Future Garmin and Strava connections

Garmin and Strava should be added after the local workout model has been tested. The app will use a user-authorized connection (OAuth): the user approves access on Garmin or Strava, then Tempo receives only the data they authorize. Imported activities should be shown clearly as imported, remain editable, and never silently replace a user’s own log.

Before enabling either connection for real users, add a hosted database, encrypted secrets, a privacy policy that names the connected data, a disconnect/delete option, and careful handling for duplicate activities that appear in both services.

## Where you can write your own code

Yes—this is your project and you are encouraged to edit it.

- `index.html` controls what people see and click.
- `server.js` controls account creation, sign-in, and profile saving.
- `plan-engine.js` controls how profile answers become workouts and how a missed day adjusts the week.
- `README.md` explains the product decisions and next steps.

Start with visual changes in `index.html`; they are instantly visible after refreshing the browser. Make a small change, save it, refresh, and observe the effect. For server changes, stop and start `node server.js` again (or use `node --watch server.js`).

## Product plan

### 1. Prototype and user validation — now

**What is happening:** this UI uses example data and simple rules to prove the product flow. Nothing is saved.

**Why:** the important early risk is not database design; it is whether users understand and trust the coach’s plan. Test this flow with 5–10 people who run, lift, or do both. Ask them to create a plan, explain why their workout is scheduled, and react to its difficulty.

**Done when:** you know which goals users choose, where setup is confusing, and whether plan explanations make the app feel credible.

### 2. Backend MVP

**What needs to be built:**

- Authentication and user profiles (goal, schedule, training level, equipment, constraints).
- Database tables for users, exercises, training plans, workouts, workout sets/runs, and feedback.
- An exercise library with movement patterns, training stimulus, equipment requirements, and safe substitutions.
- A plan-generation service. Start rules-based: create weekly volume and session types from the profile, then modify the next session after perceived effort, misses, or recovery feedback.
- APIs to read a plan, log a workout, and submit feedback.

**Why in this order:** a rules-based generator is easier to test, explain, and safeguard than an AI-generated plan. It also creates clean data for a later recommendation model.

### 3. Safety, privacy, and quality

**What needs to be built:** intake questions for injuries and medical constraints; warnings and escalation copy; user consent; deletion/export workflow; secure secrets; automated unit, integration, and end-to-end tests; accessibility and mobile testing.

**Why:** fitness plans can affect health. The app must clearly distinguish general fitness guidance from medical advice, avoid inappropriate prescriptions, and handle personal data carefully.

### 4. Publish checklist

**Before a public launch:**

- Deploy frontend, API, database, and file storage to separate production environments.
- Add a custom domain, HTTPS, backups, monitoring, error reporting, rate limiting, and rollback procedure.
- Add analytics for activation, workout completion, plan adherence, and 7/28-day retention—without collecting unnecessary sensitive data.
- Publish privacy policy, terms, health disclaimer, support contact, and account deletion flow. Obtain legal review for the launch market.
- Run a limited beta and address high-severity issues before opening sign-ups.

## Recommended first backend stack

A practical first version is a responsive web app, a TypeScript API (e.g. Next.js route handlers or Fastify), PostgreSQL, and a hosted authentication provider. Keep the training engine as an isolated service/module with auditable rules. This makes it straightforward to evolve toward richer recommendations without replacing the rest of the product.

## Suggested success metrics for the beta

- Setup completion rate
- First workout started and completed
- Workouts completed per active user per week
- Feedback submission rate
- Week-2 retention
- User-reported plan trust and appropriateness
